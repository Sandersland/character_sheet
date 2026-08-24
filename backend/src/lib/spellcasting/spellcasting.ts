/**
 * Spellcasting transaction handler. Only slot `used` counts and the learned
 * `spells[]` are persisted, in one JSON column (Character.spellcasting), so
 * revert/undo restores `before.spellcasting` exactly like the HP/XP undo
 * pattern. Slot totals, save DC/attack bonus, and the prepared limit are
 * derived at read time in serializeCharacter.
 */

import { randomUUID } from "node:crypto";


import { Prisma, type Spell } from "@/generated/prisma/client.js";
import { castAbilityInTx, type CastAbilityInput, type OpOutcome } from "./ability-cast.js";
import { clearBuffByKeyInTx, clearBuffsForSourceInTx } from "@/lib/combat/buff-end.js";
import { InvalidSpellcastingOperationError, type AbilityCost, type PayCostContext } from "./ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { applyResourceOpInTx } from "@/lib/classes/resources.js";
import { sorceryPointCostForSlot, FONT_OF_MAGIC_MAX_SLOT_LEVEL } from "@/lib/classes/font-of-magic.js";
import { readEffectSpec } from "@/lib/combat/effects.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { logEvent } from "@/lib/activity/events.js";
import { mirrorCapabilityUsedIncrement } from "@/lib/inventory/inventory-capability-use.js";
import { capabilityColumnsFromSnapshot } from "@/lib/inventory/capabilities.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";
import { normalizeSpellcastingMutable } from "./spell-state.js";
import {
  deriveGrantedSpells,
  deriveItemSpells,
  speciesGrantedSpellSourceFromRaceSelection,
  RACE_SELECTION_GRANT_SELECT,
  type GrantedSpellSource,
} from "./granted-spells.js";
import type { ItemSpellSourceItem } from "./granted-spells.js";
import type {
  SpellEntry,
  ItemSpellMeta,
  SpellComponents,
  SpellcastingMutableState,
} from "./spell-state.js";
import { deriveSpellcasting, derivePreparedSpellLimit, casterModelForEntries, type SubclassCasterRef } from "@/lib/srd/srd.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES, featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import { editionOf } from "@/lib/rules/edition.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  snapshotResources,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import type {
  ArcaneRecoveryOperation,
  CastItemSpellOperation,
  CastSpellOperation,
  ConvertSorceryPointsOperation,
  DismissBuffOperation,
  ExpendSlotOperation,
  ForgetSpellOperation,
  LearnSpellOperation,
  PrepareSpellOperation,
  RestoreSlotOperation,
  RulesEdition,
  SpellcastingOperation,
  UnprepareSpellOperation,
} from "@character-sheet/shared-types";

// Re-exported for import-path stability.
export { InvalidSpellcastingOperationError };

// normalizeSpellcastingMutable lives in a leaf module to break the
// hitpoints ↔ spellcasting import cycle; re-exported for import-path stability.
export { normalizeSpellcastingMutable };

// Re-exported for import-path stability.
export type { ForgetSpellOperation, LearnSpellOperation, SpellcastingOperation };

interface SpellOpContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  batchId: string;
  sessionId: string | null;
  state: SpellcastingMutableState;
  slotTotals: Record<number, number>;
  arcanaTotals: Record<number, number>;
  // Caster identity — threaded to castAbilityInTx for party-target heals (#462).
  casterUserId: string;
  casterName: string;
  casterCampaignId: string | null;
  // The character's own derived spell save DC / attack bonus, used to resolve a
  // wielder-mode item spell's DC/attack (#528). Null for a non-caster.
  wielderSpellSaveDC: number | null;
  wielderSpellAttackBonus: number | null;
  // Derived prepared-spell cap (#883, edition-forked #1507): null only when no
  // class entry is a caster at its level. Pact Magic is the one caster this cap
  // never governs, but it still resolves non-null through Warlock's shared array.
  preparedSpellLimit: number | null;
  // Known vs prepared (#1507 D5/D7): "known" for a 2014 Bard/Sorcerer/Warlock/
  // Ranger/EK/AT, "prepared" for everything else, null for a non-caster.
  // Drives applyLearnSpellOp's D7 born-prepared rule below.
  casterModel: "known" | "prepared" | null;
  // Arcane Recovery (#904): the mutable resources state (the once-per-long-rest
  // use counter lives here), whether the character has the pool, and the wizard
  // level driving the ceil(level/2) slot-level cap.
  resources: ResourcesMutableState;
  arcaneRecoveryAvailable: boolean;
  wizardLevel: number;
}

function applyExpendSlotOp(ctx: SpellOpContext, op: ExpendSlotOperation): OpOutcome {
  const { state, slotTotals } = ctx;
  const total = slotTotals[op.level] ?? 0;
  const used = state.slotsUsed[String(op.level)] ?? 0;
  if (total === 0) {
    throw new InvalidSpellcastingOperationError(`No level-${op.level} slots exist`);
  }
  if (used >= total) {
    throw new InvalidSpellcastingOperationError(`No level-${op.level} spell slots remaining`);
  }
  state.slotsUsed[String(op.level)] = used + 1;
  return {
    eventType: "expendSlot",
    summary: `Expended 1 level-${op.level} spell slot`,
    eventData: { level: op.level },
  };
}

function applyRestoreSlotOp(ctx: SpellOpContext, op: RestoreSlotOperation): OpOutcome {
  const { state } = ctx;
  const slotUsed = state.slotsUsed[String(op.level)] ?? 0;
  const arcanumUsed = state.arcanumUsed[String(op.level)] ?? 0;
  let summary: string;
  if (slotUsed > 0) {
    state.slotsUsed[String(op.level)] = slotUsed - 1;
    summary = `Restored 1 level-${op.level} spell slot`;
  } else if (arcanumUsed > 0) {
    // No expended slot at this level, but a Mystic Arcanum charge was spent — undo that.
    state.arcanumUsed[String(op.level)] = arcanumUsed - 1;
    summary = `Restored level-${op.level} Mystic Arcanum`;
  } else {
    throw new InvalidSpellcastingOperationError(
      `No expended level-${op.level} slots to restore`
    );
  }
  return { eventType: "restoreSlot", summary, eventData: { level: op.level } };
}

const ARCANE_RECOVERY_KEY = "arcaneRecovery";

// Aggregate the requested recoveries into a level→count map so duplicate entries
// at the same level are summed once (a per-entry check would let two entries each
// pass against the full expended count and over-recover, #904 review).
function aggregateArcaneRecovery(op: ArcaneRecoveryOperation): Map<number, number> {
  const byLevel = new Map<number, number>();
  for (const { level, count } of op.slots) {
    byLevel.set(level, (byLevel.get(level) ?? 0) + count);
  }
  return byLevel;
}

// Returns the total slot-levels recovered.
function validateArcaneRecovery(ctx: SpellOpContext, byLevel: Map<number, number>): number {
  const cap = Math.ceil(ctx.wizardLevel / 2);
  let totalLevels = 0;
  for (const [level, count] of byLevel) {
    if (level > 5) {
      throw new InvalidSpellcastingOperationError("Arcane Recovery cannot recover a slot above 5th level");
    }
    const expended = ctx.state.slotsUsed[String(level)] ?? 0;
    if (count > expended) {
      throw new InvalidSpellcastingOperationError(
        `Cannot recover ${count} level-${level} slot${count === 1 ? "" : "s"}: only ${expended} expended`,
      );
    }
    totalLevels += level * count;
  }
  if (totalLevels > cap) {
    throw new InvalidSpellcastingOperationError(
      `Arcane Recovery can restore at most ${cap} slot-level${cap === 1 ? "" : "s"}; requested ${totalLevels}`,
    );
  }
  return totalLevels;
}

// Arcane Recovery (#904), gated to once per long rest via the arcaneRecovery
// resource pool (recharge longRest, total 1), snapshotted into the event for undo.
async function applyArcaneRecoveryOp(ctx: SpellOpContext, op: ArcaneRecoveryOperation): Promise<OpOutcome> {
  const { state, resources } = ctx;
  if (!ctx.arcaneRecoveryAvailable) {
    throw new InvalidSpellcastingOperationError("Arcane Recovery is not available for this character");
  }
  if ((resources.used[ARCANE_RECOVERY_KEY] ?? 0) >= 1) {
    throw new InvalidSpellcastingOperationError("Arcane Recovery already used — regained on a long rest");
  }
  const byLevel = aggregateArcaneRecovery(op);
  const totalLevels = validateArcaneRecovery(ctx, byLevel);

  const beforeResources = snapshotResources(resources);
  for (const [level, count] of byLevel) {
    state.slotsUsed[String(level)] = (state.slotsUsed[String(level)] ?? 0) - count;
  }
  resources.used[ARCANE_RECOVERY_KEY] = 1;
  await ctx.tx.character.update({
    where: { id: ctx.characterId },
    data: { resources: serializeResourcesState(resources) },
  });

  return {
    eventType: "restoreSlot",
    summary: `Arcane Recovery — restored ${totalLevels} slot-level${totalLevels === 1 ? "" : "s"}`,
    eventData: { arcaneRecovery: true, slots: op.slots, totalLevels },
    beforeExtra: { resources: beforeResources },
    afterExtra: { resources: snapshotResources(resources) },
  };
}

const orUndef = <T>(v: T | null): T | undefined => v ?? undefined;

// Coupling latch: if you add a catalog-content field here, also add it to
// overlaySpellMechanics (#1806) or a fork won't override it on already-learned spells.
function catalogSpellToEntry(catalogSpell: Spell): SpellEntry {
  return {
    id: randomUUID(),
    spellId: catalogSpell.id,
    name: catalogSpell.name,
    level: catalogSpell.level,
    school: catalogSpell.school as string,
    prepared: false,
    castingTime: catalogSpell.castingTime,
    range: catalogSpell.range,
    duration: catalogSpell.duration,
    description: catalogSpell.description,
    concentration: catalogSpell.concentration,
    ritual: catalogSpell.ritual,
    components: orUndef(catalogSpell.components as SpellComponents | null),
    saveEffect: orUndef(catalogSpell.saveEffect),
    effectKind: orUndef(catalogSpell.effectKind),
    effectDiceCount: orUndef(catalogSpell.effectDiceCount),
    effectDiceFaces: orUndef(catalogSpell.effectDiceFaces),
    effectModifier: orUndef(catalogSpell.effectModifier),
    damageType: orUndef(catalogSpell.damageType),
    attackType: orUndef(catalogSpell.attackType),
    saveAbility: orUndef(catalogSpell.saveAbility),
    upcastDicePerLevel: orUndef(catalogSpell.upcastDicePerLevel),
    cantripScaling: catalogSpell.cantripScaling,
    buffTarget: orUndef(catalogSpell.buffTarget),
    buffModifier: orUndef(catalogSpell.buffModifier),
  };
}

// #1131: a creation-time pick is born prepared. #1513: a Wizard's spellbook
// can exceed its prepared cap — persistCreatedCharacter's clampPreparedToLimit
// applies that exception AFTER this; every entry is still born prepared:true.
export function creationSpellEntry(catalogSpell: Spell): SpellEntry {
  return { ...catalogSpellToEntry(catalogSpell), prepared: true };
}

async function resolveCatalogSpellEntry(
  tx: Prisma.TransactionClient,
  state: SpellcastingMutableState,
  spellId: string,
): Promise<SpellEntry> {
  if (state.spells.some((s) => s.spellId === spellId)) {
    throw new InvalidSpellcastingOperationError(`Spell already in spellbook (spellId: ${spellId})`);
  }
  const catalogSpell = await tx.spell.findUnique({ where: { id: spellId } });
  if (!catalogSpell) {
    throw new InvalidSpellcastingOperationError(`Spell not found in catalog: ${spellId}`);
  }
  return catalogSpellToEntry(catalogSpell);
}

// #1440: deliberately NOT class- or spell-level-gated — this op is the
// manual/homebrew scribing surface; the level-up ceremony's own eligibility
// gate lives in assertPickSpellEligibility.
//
// #1507 D7: a 2014 "known" caster's spell is castable the moment it's learned
// (SRD 5.1 has no separate preparation step for known casters), so
// `ctx.casterModel === "known"` births the entry prepared. Cantrips unaffected.
async function applyLearnSpellOp(ctx: SpellOpContext, op: LearnSpellOperation): Promise<OpOutcome> {
  const { tx, state } = ctx;
  const newEntry = await resolveCatalogSpellEntry(tx, state, op.spellId);
  if (ctx.casterModel === "known") newEntry.prepared = true;
  state.spells.push(newEntry);
  return {
    eventType: "learnSpell",
    summary: `Learned ${newEntry.name}`,
    eventData: { entryId: newEntry.id, spellName: newEntry.name, spellId: newEntry.spellId ?? null },
  };
}

async function applyForgetSpellOp(ctx: SpellOpContext, op: ForgetSpellOperation): Promise<OpOutcome> {
  const { state } = ctx;
  // Subclass- and species/lineage-granted (#1683) spells are derived, not
  // persisted — they cannot be forgotten; both use deriveGrantedSpells'
  // `granted:` id prefix. The source check covers the subclass half only:
  // source === "species" also matches a #1689 species-CHOICE entry (High
  // Elf's cantrip) that IS meant to stay forgettable.
  const idx = state.spells.findIndex((s) => s.id === op.entryId);
  if (op.entryId.startsWith("granted:") || state.spells[idx]?.source === "subclass") {
    throw new InvalidSpellcastingOperationError("Cannot forget a subclass- or species-lineage-granted spell.");
  }
  if (idx === -1) {
    throw new InvalidSpellcastingOperationError(`Spell entry not found: ${op.entryId}`);
  }
  const forgotten = state.spells[idx];
  state.spells.splice(idx, 1);
  // Forgetting the spell you're concentrating on ends that concentration and
  // drops any buffs it maintained (#438).
  if (state.concentratingOn?.entryId === op.entryId) {
    state.concentratingOn = null;
    await clearBuffsForSourceInTx(ctx.tx, ctx.characterId, op.entryId, ctx.batchId, ctx.sessionId, "removal");
  }
  return {
    eventType: "forgetSpell",
    summary: `Removed ${forgotten.name} from spellbook`,
    eventData: { entryId: op.entryId, spellName: forgotten.name },
  };
}

function applyPrepareSpellOp(
  ctx: SpellOpContext,
  op: PrepareSpellOperation | UnprepareSpellOperation
): OpOutcome | null {
  const { state } = ctx;
  const entry = state.spells.find((s) => s.id === op.entryId);
  if (!entry) {
    throw new InvalidSpellcastingOperationError(`Spell entry not found: ${op.entryId}`);
  }
  if (entry.level === 0) {
    throw new InvalidSpellcastingOperationError(
      "Cantrips are always prepared and cannot be toggled"
    );
  }
  const preparing = op.type === "prepareSpell";
  // Already in the desired state — no-op (skip write + log).
  if (preparing === entry.prepared) return null;
  // Prepared-spell cap (#883). Grants (source!=null) and cantrips never count.
  if (preparing && ctx.preparedSpellLimit != null) {
    const count = state.spells.filter((s) => s.prepared && s.level > 0 && s.source == null).length;
    if (count >= ctx.preparedSpellLimit) {
      throw new InvalidSpellcastingOperationError(
        `You can prepare at most ${ctx.preparedSpellLimit} spells.`,
      );
    }
  }
  entry.prepared = preparing;
  return {
    eventType: op.type,
    summary: preparing ? `Prepared ${entry.name}` : `Unprepared ${entry.name}`,
    eventData: { entryId: op.entryId, spellName: entry.name, prepared: preparing },
  };
}

// Adapt a SpellOpContext to the ability-cost payer's context. The slot maps are
// the same references as state.slotsUsed/arcanumUsed, so in-place spends persist.
function costCtx(ctx: SpellOpContext): PayCostContext {
  return {
    tx: ctx.tx,
    characterId: ctx.characterId,
    batchId: ctx.batchId,
    sessionId: ctx.sessionId,
    slotsUsed: ctx.state.slotsUsed,
    arcanumUsed: ctx.state.arcanumUsed,
    slotTotals: ctx.slotTotals,
    arcanaTotals: ctx.arcanaTotals,
  };
}

// A leveled spell's slot cost falls back to Mystic Arcanum in the payer.
async function applyCastSpellOp(ctx: SpellOpContext, op: CastSpellOperation): Promise<OpOutcome> {
  const entry = ctx.state.spells.find((s) => s.id === op.entryId);
  if (!entry) {
    throw new InvalidSpellcastingOperationError(`Spell entry not found: ${op.entryId}`);
  }
  const cost: AbilityCost = entry.level === 0 ? { kind: "none" } : { kind: "slot", minLevel: entry.level };
  return castAbilityInTx(
    {
      tx: ctx.tx,
      characterId: ctx.characterId,
      batchId: ctx.batchId,
      sessionId: ctx.sessionId,
      cost: costCtx(ctx),
      concentrationHost: ctx.state,
      casterUserId: ctx.casterUserId,
      casterName: ctx.casterName,
      casterCampaignId: ctx.casterCampaignId,
    },
    {
      name: entry.name,
      entryId: op.entryId,
      cost,
      effect: readEffectSpec(entry),
      requested: op.slotLevel,
      roll: op.roll,
      eventType: "castSpell",
      concentrates: Boolean(entry.concentration),
      apply: op.apply,
    },
  );
}

interface ResolvedItemSpell {
  entry: SpellEntry;
  meta: ItemSpellMeta;
  spell: Spell;
  chargeCost: number | null;
  dc: number | null;
  attack: number | null;
}

// Folded into the event for undo refunds (#580).
interface ItemResourceSpend {
  poolUsedAfter: number | null;
  capabilityUsedBefore: { capabilityId: string; used: number } | null;
  capabilityUsedAfter: { capabilityId: string; used: number } | null;
}

function assertItemSpellUses(entry: SpellEntry, meta: ItemSpellMeta, chargeCost: number | null): void {
  if (chargeCost != null && meta.usesRemaining < chargeCost) {
    throw new InvalidSpellcastingOperationError(
      `${entry.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — ${meta.itemName} has ${meta.usesRemaining} remaining`,
    );
  }
  if (chargeCost == null && meta.usesRemaining <= 0) {
    throw new InvalidSpellcastingOperationError(
      `${entry.name} has no uses remaining — recharges on the item's rest`,
    );
  }
}

// Fixed mode uses the item's value, wielder the character's own (a non-caster
// wielder is prevented at authoring).
function resolveItemDcAttack(
  ctx: SpellOpContext,
  meta: ItemSpellMeta,
): { dc: number | null; attack: number | null } {
  return {
    dc: meta.dcMode === "wielder" ? ctx.wielderSpellSaveDC : meta.dc ?? null,
    attack: meta.attackMode === "wielder" ? ctx.wielderSpellAttackBonus : meta.attack ?? null,
  };
}

async function resolveItemSpellCast(
  ctx: SpellOpContext,
  op: CastItemSpellOperation,
): Promise<ResolvedItemSpell> {
  const entry = ctx.state.spells.find((s) => s.id === op.entryId && s.source === "item");
  if (!entry?.item) {
    throw new InvalidSpellcastingOperationError(
      `Item spell not available: ${op.entryId} (item unequipped/unattuned or removed)`,
    );
  }
  const meta = entry.item;
  // Charges-costed casts (#555) spend chargeCost from the item's shared pool;
  // usesRemaining already mirrors the pool's remaining (deriveItemSpells).
  const chargeCost = meta.resource === "charges" ? meta.chargeCost ?? 1 : null;
  assertItemSpellUses(entry, meta, chargeCost);
  if (!entry.spellId) {
    throw new InvalidSpellcastingOperationError(`Item spell ${op.entryId} has no referenced spell`);
  }
  const spell = await ctx.tx.spell.findUnique({ where: { id: entry.spellId } });
  if (!spell) {
    throw new InvalidSpellcastingOperationError(`Referenced spell not found in catalog: ${entry.spellId}`);
  }
  const { dc, attack } = resolveItemDcAttack(ctx, meta);
  return { entry, meta, spell, chargeCost, dc, attack };
}

// Spend the item's resource (skip for at-will), persisted outside the spell
// blob: charges-costed casts increment the shared POOL row by chargeCost,
// everything else the capability's own per-period counter by 1. Used-counter
// snapshots feed undo refunds (#580).
async function spendItemSpellResource(
  ctx: SpellOpContext,
  entry: SpellEntry,
  meta: ItemSpellMeta,
  chargeCost: number | null,
): Promise<ItemResourceSpend> {
  let poolUsedAfter: number | null = null;
  let capabilityUsedBefore: { capabilityId: string; used: number } | null = null;
  let capabilityUsedAfter: { capabilityId: string; used: number } | null = null;
  if (chargeCost != null) {
    if (!meta.poolCapabilityId) {
      throw new InvalidSpellcastingOperationError(`${meta.itemName} has no charges pool to spend from`);
    }
    // Atomic conditional spend (TOCTOU guard): under READ COMMITTED, two
    // concurrent casts can both pass the derived remaining-check above. The
    // WHERE re-evaluates against the committed row under its write lock, so
    // racers serialize and an overdraw loses (count 0 → whole tx rolls back)
    // instead of pushing `used` past maxCharges.
    // Scoped by inventoryItemId as well as the key: the unique constraint is
    // (inventoryItemId, capabilityKey), so the key alone does not identify a
    // row. Keys are per-acquisition UUIDs and a collision is not reachable
    // today, but this is the overdraw guard — resting it on an unstated
    // assumption is what makes such a guard quietly stop guarding.
    const spent = await ctx.tx.inventoryCapabilityUse.updateMany({
      where: {
        inventoryItemId: meta.inventoryItemId,
        capabilityKey: meta.poolCapabilityId,
        used: { lte: meta.usesTotal - chargeCost },
      },
      data: { used: { increment: chargeCost } },
    });
    if (spent.count === 0) {
      throw new InvalidSpellcastingOperationError(
        `${entry.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — ${meta.itemName} has too few remaining`,
      );
    }
    // Re-read for the event data: under a race the pre-tx snapshot is stale.
    const fresh = await ctx.tx.inventoryCapabilityUse.findFirstOrThrow({
      where: { inventoryItemId: meta.inventoryItemId, capabilityKey: meta.poolCapabilityId },
      select: { used: true },
    });
    poolUsedAfter = fresh.used;
    capabilityUsedBefore = { capabilityId: meta.poolCapabilityId, used: fresh.used - chargeCost };
    capabilityUsedAfter = { capabilityId: meta.poolCapabilityId, used: fresh.used };
  } else if (meta.usesTotal !== Infinity) {
    await mirrorCapabilityUsedIncrement(ctx.tx, meta.capabilityId, 1);
    const updated = await ctx.tx.inventoryCapabilityUse.findFirstOrThrow({
      where: { inventoryItemId: meta.inventoryItemId, capabilityKey: meta.capabilityId },
      select: { used: true },
    });
    capabilityUsedBefore = { capabilityId: meta.capabilityId, used: updated.used - 1 };
    capabilityUsedAfter = { capabilityId: meta.capabilityId, used: updated.used };
  }
  return { poolUsedAfter, capabilityUsedBefore, capabilityUsedAfter };
}

function decorateItemSpellOutcome(
  outcome: OpOutcome,
  resolved: ResolvedItemSpell,
  spend: ItemResourceSpend,
): void {
  const { meta, chargeCost, dc, attack } = resolved;
  const dcText = dc != null ? ` (DC ${dc})` : attack != null ? ` (+${attack} to hit)` : "";
  outcome.summary += dcText;
  if (spend.capabilityUsedBefore && spend.capabilityUsedAfter) {
    outcome.beforeExtra = { capabilityUsed: spend.capabilityUsedBefore };
    outcome.afterExtra = { capabilityUsed: spend.capabilityUsedAfter };
  }
  outcome.eventData = {
    ...outcome.eventData,
    source: "item",
    inventoryItemId: meta.inventoryItemId,
    capabilityId: meta.capabilityId,
    itemName: meta.itemName,
    dc,
    attack,
    ...(chargeCost != null
      ? {
          poolCapabilityId: meta.poolCapabilityId,
          chargesSpent: chargeCost,
          chargesRemaining: Math.max(0, meta.usesTotal - (spend.poolUsedAfter ?? 0)),
        }
      : {}),
  };
}

// Cast a spell granted by a held item (#528): the item's resource is spent,
// never a character slot; DC/attack resolve per the fixed/wielder mode.
async function applyCastItemSpellOp(ctx: SpellOpContext, op: CastItemSpellOperation): Promise<OpOutcome> {
  const resolved = await resolveItemSpellCast(ctx, op);
  const { entry, meta, spell, chargeCost } = resolved;

  const outcome = await castAbilityInTx(
    {
      tx: ctx.tx,
      characterId: ctx.characterId,
      batchId: ctx.batchId,
      sessionId: ctx.sessionId,
      cost: costCtx(ctx),
      concentrationHost: ctx.state,
      casterUserId: ctx.casterUserId,
      casterName: ctx.casterName,
      casterCampaignId: ctx.casterCampaignId,
    },
    {
      name: entry.name,
      entryId: op.entryId,
      cost: { kind: "none" },
      effect: readEffectSpec(spell),
      roll: op.roll,
      eventType: "castSpell",
      concentrates: Boolean(spell.concentration),
      apply: op.apply,
    },
  );

  const spend = await spendItemSpellResource(ctx, entry, meta, chargeCost);
  decorateItemSpellOutcome(outcome, resolved, spend);
  return outcome;
}

async function applyDropConcentrationOp(ctx: SpellOpContext): Promise<OpOutcome | null> {
  const { state } = ctx;
  const prior = state.concentratingOn;
  // Nothing to drop — idempotent no-op (skip write + log).
  if (!prior) return null;
  state.concentratingOn = null;
  // Ending concentration drops any buffs it was maintaining (#438).
  await clearBuffsForSourceInTx(ctx.tx, ctx.characterId, prior.entryId, ctx.batchId, ctx.sessionId, "removal");
  return {
    eventType: "concentrationDropped",
    summary: `Stopped concentrating on ${prior.spellName}`,
    eventData: { droppedEntryId: prior.entryId, droppedSpellName: prior.spellName, reason: "manual" },
  };
}

// Dismiss an active while-active spell buff (e.g. ending Mage Armor early, #363).
// The clear helper logs its own undoable `effects` event and no-ops when the buff
// is absent or is concentration-scoped, so this returns null (no spellcasting-blob
// change) and the dispatcher skips its own event.
async function applyDismissBuffOp(ctx: SpellOpContext, op: DismissBuffOperation): Promise<OpOutcome | null> {
  await clearBuffByKeyInTx(ctx.tx, ctx.characterId, op.entryId, ctx.batchId, ctx.sessionId, "dismissed");
  return null;
}

// Font of Magic (#903). Composes with the resources handler for the SP pool
// (validates the pool exists + bounds, logs its own resources event under this
// batch) and mutates the slot state here (logged as the spellcasting event) —
// both revert on one LIFO undo of the batch.
async function applyConvertSorceryPointsOp(
  ctx: SpellOpContext,
  op: ConvertSorceryPointsOperation,
): Promise<OpOutcome> {
  const { state, slotTotals, tx, characterId, batchId, sessionId } = ctx;
  const level = op.slotLevel;
  const key = String(level);

  if (op.direction === "toSlot") {
    const cost = sorceryPointCostForSlot(level);
    if (cost == null) {
      throw new InvalidSpellcastingOperationError(
        `Font of Magic can only create spell slots of level 1-${FONT_OF_MAGIC_MAX_SLOT_LEVEL}`,
      );
    }
    if ((slotTotals[level] ?? 0) === 0) {
      throw new InvalidSpellcastingOperationError(`You have no level-${level} spell slots`);
    }
    // Spend the SP first — validates the pool exists and enough points remain.
    await applyResourceOpInTx(tx, characterId, { type: "spendResource", key: "sorceryPoints", amount: cost }, batchId, sessionId);
    // Creating a slot = one more available; `used` may go negative (extra slot).
    state.slotsUsed[key] = (state.slotsUsed[key] ?? 0) - 1;
    return {
      eventType: "convertSorceryPoints",
      summary: `Converted ${cost} sorcery points into a level-${level} spell slot`,
      eventData: { direction: "toSlot", slotLevel: level, sorceryPointCost: cost },
    };
  }

  const used = state.slotsUsed[key] ?? 0;
  if ((slotTotals[level] ?? 0) - used <= 0) {
    throw new InvalidSpellcastingOperationError(`No level-${level} spell slots remaining to convert`);
  }
  state.slotsUsed[key] = used + 1;
  // Gain SP = slot level; restoreResource throws if this would exceed the max,
  // rejecting the whole conversion (slot stays unspent) — it does not clamp.
  await applyResourceOpInTx(tx, characterId, { type: "restoreResource", key: "sorceryPoints", amount: level }, batchId, sessionId);
  return {
    eventType: "convertSorceryPoints",
    summary: `Converted a level-${level} spell slot into ${level} sorcery points`,
    eventData: { direction: "toSorceryPoints", slotLevel: level, sorceryPointsGained: level },
  };
}

type DerivedSpellcasting = ReturnType<typeof deriveSpellcasting>;

// Falls back to any stored legacy totals for unsupported caster classes.
function computeSlotTables(
  spellcasting: Prisma.JsonValue,
  derived: DerivedSpellcasting,
): { slotTotals: Record<number, number>; arcanaTotals: Record<number, number> } {
  const slotTotals: Record<number, number> = {};
  const arcanaTotals: Record<number, number> = {};
  if (derived) {
    for (const s of derived.slotTotals) slotTotals[s.level] = s.total;
    for (const a of derived.arcana) arcanaTotals[a.level] = a.total;
  } else if (spellcasting && typeof spellcasting === "object" && !Array.isArray(spellcasting)) {
    const stored = spellcasting as Record<string, unknown>;
    const oldSlots = (stored.slots as Array<{ level: number; total: number }>) ?? [];
    for (const s of oldSlots) slotTotals[s.level] = s.total;
  }
  return { slotTotals, arcanaTotals };
}

// Inject derived subclass-granted (#438) + species-granted (#1683) +
// item-granted (#528) spells into the working state so ops that target them
// resolve. Disjoint id spaces; stripped again before persist
// (persistSpellState) — they live only in the read view.
function injectDerivedSpells(
  state: SpellcastingMutableState,
  subclassRef: GrantedSpellSource | null | undefined,
  speciesRef: GrantedSpellSource | null | undefined,
  level: number,
  itemSources: ItemSpellSourceItem[],
  edition: RulesEdition,
): void {
  const granted = [
    ...deriveGrantedSpells(subclassRef, level, edition),
    ...deriveGrantedSpells(speciesRef, level, edition, "species"),
  ];
  if (granted.length > 0) {
    const names = new Set(state.spells.map((s) => s.name.toLowerCase()));
    for (const g of granted) if (!names.has(g.name.toLowerCase())) state.spells.push(g);
  }
  for (const s of deriveItemSpells(itemSources)) state.spells.push(s);
}

function cloneSpellState(state: SpellcastingMutableState): { spellcasting: SpellcastingMutableState } {
  return {
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...state.spells],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  };
}

// Strip derived grants (subclass + #1683 species/lineage) + item spells
// (all re-derived on read) and persist the state. A #1689 species-CHOICE
// entry (source:"species", but never `granted:`-id-prefixed) is deliberately
// KEPT — it IS the persisted record, not a re-derivable grant; see
// SpellEntry.source for the full split.
async function persistSpellState(
  tx: Prisma.TransactionClient,
  characterId: string,
  state: SpellcastingMutableState,
): Promise<void> {
  state.spells = state.spells.filter((s) => {
    if (s.source === "item" || s.source === "subclass") return false;
    if (s.source === "species" && s.id.startsWith("granted:")) return false;
    return true;
  });
  await tx.character.update({
    where: { id: characterId },
    data: {
      spellcasting: {
        slotsUsed: state.slotsUsed,
        arcanumUsed: state.arcanumUsed,
        spells: state.spells,
        concentratingOn: state.concentratingOn,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

type SpellOpResult = OpOutcome | null | Promise<OpOutcome | null>;

// Per-op handlers keyed by discriminant. A null outcome means no-op — the
// dispatcher skips both the state write-back and the logEvent.
const SPELL_OP_HANDLERS: {
  [K in SpellcastingOperation["type"]]: (
    ctx: SpellOpContext,
    op: Extract<SpellcastingOperation, { type: K }>,
  ) => SpellOpResult;
} = {
  castSpell: applyCastSpellOp,
  castItemSpell: applyCastItemSpellOp,
  expendSlot: applyExpendSlotOp,
  restoreSlot: applyRestoreSlotOp,
  arcaneRecovery: applyArcaneRecoveryOp,
  learnSpell: applyLearnSpellOp,
  forgetSpell: applyForgetSpellOp,
  prepareSpell: applyPrepareSpellOp,
  unprepareSpell: applyPrepareSpellOp,
  dropConcentration: applyDropConcentrationOp,
  dismissBuff: applyDismissBuffOp,
  convertSorceryPoints: applyConvertSorceryPointsOp,
};

function dispatchSpellOp(ctx: SpellOpContext, op: SpellcastingOperation): SpellOpResult {
  const handler = SPELL_OP_HANDLERS[op.type] as (ctx: SpellOpContext, op: SpellcastingOperation) => SpellOpResult;
  return handler(ctx, op);
}

type SpellStateSnapshot = ReturnType<typeof cloneSpellState>;

// Assemble the per-op context, resolving the wielder's own DC/attack (#528).
function buildSpellOpContext(
  ids: {
    tx: Prisma.TransactionClient;
    characterId: string;
    batchId: string;
    sessionId: string | null;
    casterUserId: string;
  },
  row: { name: string; campaignId: string | null },
  state: SpellcastingMutableState,
  slotTotals: Record<number, number>,
  arcanaTotals: Record<number, number>,
  derived: DerivedSpellcasting,
  preparedSpellLimit: number | null,
  casterModel: "known" | "prepared" | null,
  arcaneRecovery: { resources: ResourcesMutableState; available: boolean; wizardLevel: number },
): SpellOpContext {
  return {
    ...ids,
    state,
    slotTotals,
    arcanaTotals,
    casterName: row.name,
    casterCampaignId: row.campaignId,
    wielderSpellSaveDC: derived?.spellSaveDC ?? null,
    wielderSpellAttackBonus: derived?.spellAttackBonus ?? null,
    preparedSpellLimit,
    casterModel,
    resources: arcaneRecovery.resources,
    arcaneRecoveryAvailable: arcaneRecovery.available,
    wizardLevel: arcaneRecovery.wizardLevel,
  };
}

// Log the per-op CharacterEvent with the full before/after snapshot (+ any
// capability-used extras) for revert symmetry with the HP/XP undo handler.
async function logSpellcastingEvent(
  tx: Prisma.TransactionClient,
  ids: { characterId: string; batchId: string; sessionId: string | null },
  outcome: OpOutcome,
  beforeState: SpellStateSnapshot,
  afterState: SpellStateSnapshot,
): Promise<void> {
  await logEvent(tx, {
    characterId: ids.characterId,
    category: "spellcasting",
    type: outcome.eventType as Parameters<typeof logEvent>[1]["type"],
    summary: outcome.summary,
    before: { ...beforeState, ...(outcome.beforeExtra ?? {}) },
    after: { ...afterState, ...(outcome.afterExtra ?? {}) },
    data: outcome.eventData,
    batchId: ids.batchId,
    sessionId: ids.sessionId,
  });
}

// The lean subset of SPELLCASTING_SELECT loadSlotPayContext needs to derive
// slot/arcana totals for a caller with no SpellOpContext of its own.
const SLOT_PAY_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  rulesEdition: true,
  spellcasting: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, subclassRef: { select: { casterFraction: true, spellcastingAbility: true } } },
  },
} satisfies Prisma.CharacterSelect;

/**
 * Loads the character, derives its slot/arcana totals, and assembles the
 * `PayCostContext` a `{kind:"slot"}` payment needs — shared by
 * castAbilityWithSlotInTx and applyResolveActionOperations so the two can
 * never compute the totals differently. Each caller supplies its own
 * not-found semantics via `onMissing` (5xx internal invariant vs 400 op
 * error) and owns its own before/after snapshot. Same scope as
 * buildSpellcastingOp's derivation: primary class only, XP-derived total level.
 */
export async function loadSlotPayContext(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  onMissing: (characterId: string) => Error,
): Promise<{ state: SpellcastingMutableState; costCtx: PayCostContext }> {
  const row = await tx.character.findUnique({ where: { id: characterId }, select: SLOT_PAY_SELECT });
  if (!row) throw onMissing(characterId);

  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const primary = row.classEntries[0];
  const derived = deriveSpellcasting(
    primary?.name ?? "",
    level,
    row.abilityScores as Record<string, number>,
    profBonus,
    primary?.subclassRef,
    editionOf(row),
  );
  const { slotTotals, arcanaTotals } = computeSlotTables(row.spellcasting, derived);
  const state = normalizeSpellcastingMutable(row.spellcasting);

  const costCtx: PayCostContext = {
    tx,
    characterId,
    batchId,
    sessionId,
    slotsUsed: state.slotsUsed,
    arcanumUsed: state.arcanumUsed,
    slotTotals,
    arcanaTotals,
  };

  return { state, costCtx };
}

/**
 * Pays + logs a `{kind:"slot"}` ability cost for a caller with no
 * SpellOpContext of its own (#1687) — the row-driven ability dispatcher's
 * counterpart to applySpellcastingOpInTx's load → pay → persist → log sequence.
 */
export async function castAbilityWithSlotInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  input: CastAbilityInput,
): Promise<OpOutcome> {
  const { state, costCtx } = await loadSlotPayContext(
    tx,
    characterId,
    batchId,
    sessionId,
    // Internal invariant, not a client error: the character was already loaded
    // in this same transaction (applyRowDrivenActionInTx) — a miss here is a
    // server fault (5xx), so a plain Error, not the 400-mapped op error.
    (id) => new Error(`Character not found: ${id}`),
  );
  const before = cloneSpellState(state);

  const outcome = await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: state },
    input,
  );

  await persistSpellState(tx, characterId, state);
  await logSpellcastingEvent(tx, { characterId, batchId, sessionId }, outcome, before, cloneSpellState(state));
  return outcome;
}

// Shared "load row → build op context" preamble for applySpellcastingOpInTx
// and castSpellForResolutionInTx; the not-found error is client-facing in both.
async function loadSpellOpContext(
  ids: { tx: Prisma.TransactionClient; characterId: string; batchId: string; sessionId: string | null; casterUserId: string },
): Promise<{ ctx: SpellOpContext; state: SpellcastingMutableState; beforeState: SpellStateSnapshot }> {
  const row = await ids.tx.character.findUnique({ where: { id: ids.characterId }, select: SPELLCASTING_SELECT });
  if (!row) {
    throw new InvalidSpellcastingOperationError(`Character not found: ${ids.characterId}`);
  }
  return buildSpellcastingOp(ids, row);
}

/**
 * Runs a `castSpell` op's full side-effect sequence and persists the resulting
 * spell state, but returns the outcome + before/after snapshots INSTEAD OF
 * logging a "castSpell" event (#1833): the caller (resolveAction) logs its own
 * consolidated combat-rail event under the SAME batchId, so LIFO undo reverts
 * every sub-effect (concentration, buffs, heals) together as one batch.
 */
export async function castSpellForResolutionInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  casterUserId: string,
  op: CastSpellOperation,
): Promise<{ outcome: OpOutcome; before: SpellStateSnapshot; after: SpellStateSnapshot }> {
  const { ctx, state, beforeState } = await loadSpellOpContext({ tx, characterId, batchId, sessionId, casterUserId });
  // Deliberately applyCastSpellOp, not dispatchSpellOp (#1848 review): the op
  // is statically "castSpell" and the outcome non-null, so dispatching would
  // only add a widen and a dead null-check. A cross-cutting wrapper around
  // dispatchSpellOp must also cover this entry point (or wrap
  // SPELL_OP_HANDLERS, the choke point both read from).
  const outcome = await applyCastSpellOp(ctx, op);
  await persistSpellState(tx, characterId, state);
  return { outcome, before: beforeState, after: cloneSpellState(state) };
}

/**
 * Applies a batch of spellcasting operations atomically: one batchId groups
 * the ops, any throw rolls back the whole batch, and each op logs a
 * CharacterEvent with full before/after snapshots for undo. State is loaded
 * per op so each op sees the previous op's result.
 */
export async function applySpellcastingOperations(
  characterId: string,
  operations: SpellcastingOperation[],
  casterUserId: string,
): Promise<void> {
  // The scaffold's per-op row is only the existence check: applySpellcastingOpInTx
  // re-reads its own state via SPELLCASTING_SELECT so it composes under a caller tx.
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidSpellcastingOperationError(`Character not found: ${id}`),
    applyOp: ({ tx, op, characterId: id, batchId, sessionId }) =>
      applySpellcastingOpInTx(tx, id, op, batchId, sessionId, casterUserId),
  });
}

// Columns/relations applySpellcastingOpInTx re-reads per op; the batch wrapper's
// scaffold row is an existence-only { id: true } check.
const SPELLCASTING_SELECT = {
  name: true,
  campaignId: true,
  spellcasting: true,
  resources: true,
  experiencePoints: true,
  abilityScores: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    // All entries (not just the primary) so the multiclass prepared-cap sum works.
    select: {
      name: true,
      level: true,
      subclass: true,
      // features: the carrier that resolves Wizard's row-driven arcaneRecovery
      // pool. subclassLevel: featureRowsOf carries it into isSubclassActive so
      // a 2014 subclass gates at its PHB'14 level here too (#1576).
      class: {
        select: {
          subclassLevel: true,
          features: FEATURE_ROWS_CLASS_FEATURES,
        },
      },
      // grantedSpells feed injectDerivedSpells (#898), which reads `name` via
      // GrantedSpellSource; casterFraction/spellcastingAbility drive the
      // third-caster prepared-limit resolution (#1531).
      subclassRef: {
        select: {
          name: true,
          casterFraction: true,
          spellcastingAbility: true,
          grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } },
          features: FEATURE_ROWS_SUBCLASS_FEATURES,
        },
      },
    },
  },
  // Species/lineage-granted spells (#1683), injected into the working view so
  // a species grant is actually castable/preparable, not just visible on the
  // read path. RACE_SELECTION_GRANT_SELECT is the same fragment level
  // reconciliation uses.
  raceSelection: { select: RACE_SELECTION_GRANT_SELECT },
  // Capabilities are reconstructed from `snapshot` + `capabilityUses` in
  // buildSpellcastingOp (#1649).
  inventoryItems: {
    select: { id: true, name: true, equippedSlot: true, attuned: true, snapshot: true, capabilityUses: true },
  },
} satisfies Prisma.CharacterSelect;

type SpellcastingRow = Prisma.CharacterGetPayload<{ select: typeof SPELLCASTING_SELECT }>;

// Arcane Recovery (#904): the pool comes from the primary class's derived
// resources — present only for a wizard — so usage and resetRestResources'
// long-rest refresh key off the same fact. Single-class uses the XP-derived
// level; multiclass uses the primary entry's.
function resolveArcaneRecoveryContext(
  row: SpellcastingRow,
  className: string,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
): { resources: ResourcesMutableState; available: boolean; wizardLevel: number } {
  const primary = row.classEntries[0];
  const wizardLevel = row.classEntries.length === 1 ? level : primary?.level ?? level;
  const resourceInfo = deriveResources(
    className,
    primary?.subclass ?? undefined,
    wizardLevel,
    abilityScores,
    profBonus,
    primary ? featureRowsOf(primary) : undefined,
    editionOf(row),
  );
  return {
    resources: normalizeResourcesMutable(row.resources),
    available: Boolean(resourceInfo?.resources.some((r) => r.key === "arcaneRecovery")),
    wizardLevel,
  };
}

// Read fresh state and assemble the per-op context + before-snapshot.
function buildSpellcastingOp(
  ids: { tx: Prisma.TransactionClient; characterId: string; batchId: string; sessionId: string | null; casterUserId: string },
  row: SpellcastingRow,
): { ctx: SpellOpContext; state: SpellcastingMutableState; beforeState: SpellStateSnapshot } {
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const className = row.classEntries[0]?.name ?? "";
  const abilityScores = row.abilityScores as Record<string, number>;
  const edition = editionOf(row);
  // `subclass` stays undefined — deliberate primary-class-only scope (#1507).
  const derived = deriveSpellcasting(className, level, abilityScores, profBonus, undefined, edition);
  // Single-class uses the XP-derived level (per-class column can be stale) so the
  // enforced cap matches the serialized limit; multiclass uses per-entry levels.
  const limitEntries: Array<{ name: string; level: number; subclassRef?: SubclassCasterRef | null }> = row.classEntries.length === 1
    ? [{ name: className, level, subclassRef: row.classEntries[0]?.subclassRef ?? null }]
    : row.classEntries.map((e) => ({ name: e.name, level: e.level, subclassRef: e.subclassRef }));
  // Coupling latch (#1507): the same derivePreparedSpellLimit as
  // buildSpellcastingView's clamp-on-read and reconcilePreparedSpells — never
  // a second inline copy of the cap.
  const preparedSpellLimit = derivePreparedSpellLimit(limitEntries, abilityScores, edition);
  // The one combiner buildSpellcastingView's wire field also calls (#1507) —
  // never a second inline copy.
  const casterModel = casterModelForEntries(limitEntries, edition);

  const { slotTotals, arcanaTotals } = computeSlotTables(row.spellcasting, derived);

  const arcaneRecovery = resolveArcaneRecoveryContext(row, className, level, abilityScores, profBonus);

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const beforeState = cloneSpellState(state);

  // #1683: the species source is independent of any class entry — resolved via
  // the same adapter level reconciliation uses, not the serialize layer's own
  // (that would invert this module's dependency direction).
  const speciesSource = speciesGrantedSpellSourceFromRaceSelection(row.raceSelection);

  injectDerivedSpells(
    state,
    row.classEntries[0]?.subclassRef,
    speciesSource,
    level,
    row.inventoryItems.map((i) => {
      const snapshot = readInventorySnapshot(i);
      const usedByKey = new Map(i.capabilityUses.map((u) => [u.capabilityKey, u.used]));
      return {
        id: i.id,
        name: i.name,
        // #565: `equipped` is derived from equippedSlot (no persisted boolean).
        equipped: i.equippedSlot != null,
        attuned: i.attuned,
        capabilities: snapshot.capabilities.map((c) => capabilityColumnsFromSnapshot(c, usedByKey.get(c.key) ?? 0)),
      };
    }),
    editionOf(row),
  );

  const ctx = buildSpellOpContext(ids, row, state, slotTotals, arcanaTotals, derived, preparedSpellLimit, casterModel, arcaneRecovery);
  return { ctx, state, beforeState };
}

/**
 * Applies one spellcasting op inside a caller-supplied transaction/batchId, so the
 * unified level-up endpoint (#885) can compose spellcasting with other domains
 * under one batchId. Reads fresh state via `tx` on every call (a batch sees each
 * prior op's result), dispatches, and — unless the op is a no-op (null outcome) —
 * persists + logs its own event (the single copy of the logic).
 */
export async function applySpellcastingOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: SpellcastingOperation,
  batchId: string,
  sessionId: string | null,
  casterUserId: string,
): Promise<void> {
  const { ctx, state, beforeState } = await loadSpellOpContext({ tx, characterId, batchId, sessionId, casterUserId });

  const outcome = await dispatchSpellOp(ctx, op);
  if (outcome === null) return;

  await persistSpellState(tx, characterId, state);
  await logSpellcastingEvent(
    tx,
    { characterId, batchId, sessionId },
    outcome,
    beforeState,
    cloneSpellState(state),
  );
}
