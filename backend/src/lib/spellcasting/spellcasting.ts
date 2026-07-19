/**
 * Spellcasting transaction handler — the spellcasting counterpart to
 * lib/inventory/inventory.ts and lib/combat/hitpoints.ts.
 *
 * The per-character mutable spell state lives in a single JSON column
 * (Character.spellcasting) rather than relational rows — see the plan note
 * in CLAUDE.md. This keeps revert/undo identical to the HP/XP undo pattern
 * (restore `before.spellcasting` from a CharacterEvent) and avoids a new
 * `CharacterSpell` table.
 *
 * What is persisted: slot `used` counts and the learned `spells[]` array.
 * What is derived at read time (in lib/character/character-serialize.ts serializeCharacter):
 *   - slot totals (from srd/srd.ts FULL_CASTER_SLOTS + class + level)
 *   - spellSaveDC / spellAttackBonus / ability (from srd/srd.ts deriveSpellcasting)
 *   - preparedSpellLimit / preparedSpellCount (from srd/srd.ts derivePreparedSpellLimit)
 */

import { randomUUID } from "node:crypto";


import { Prisma, type Spell } from "@/generated/prisma/client.js";
import { castAbilityInTx, type CastTarget, type OpOutcome } from "./ability-cast.js";
import { clearBuffByKeyInTx, clearBuffsForSourceInTx } from "@/lib/combat/active-effects.js";
import { InvalidSpellcastingOperationError, type AbilityCost, type PayCostContext } from "./ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { applyResourceOpInTx } from "@/lib/classes/resources.js";
import { sorceryPointCostForSlot, FONT_OF_MAGIC_MAX_SLOT_LEVEL } from "@/lib/classes/sorcerer.js";
import { readEffectSpec } from "@/lib/combat/effects.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { logEvent } from "@/lib/activity/events.js";
import { normalizeSpellcastingMutable } from "./spell-state.js";
import { deriveGrantedSpells, deriveItemSpells, type GrantedSpellSource } from "./granted-spells.js";
import type { ItemSpellSourceItem } from "./granted-spells.js";
import type {
  SpellEntry,
  ItemSpellMeta,
  SpellComponents,
  SpellcastingMutableState,
} from "./spell-state.js";
import { deriveSpellcasting, derivePreparedSpellLimit } from "@/lib/srd/srd.js";

// Defined in ability-cost.ts (one-directional dep graph); re-exported so
// existing importers (spellcastingRouter) keep resolving it here unchanged.
export { InvalidSpellcastingOperationError };

// Persisted spell state shape + normalizer live in the leaf module spell-state.ts
// (extracted to break the hitpoints ↔ spellcasting import cycle). Re-exported
// here so this module's public surface stays stable.
export { normalizeSpellcastingMutable };

export interface CustomSpellInput {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  components?: SpellComponents;
  saveEffect?: string;
  effectKind?: string;
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: string;
  saveAbility?: string;
  upcastDicePerLevel?: number;
  cantripScaling?: boolean;
}

/**
 * Cast a spell. For leveled spells, `slotLevel` must be >= spell.level and a
 * slot of that level must be available. Cantrips (spell.level === 0) skip slot
 * expenditure. `roll` is the client-computed effect total (0 for utility spells
 * with no dice); the server validates and logs it but does not recompute.
 */
export interface CastSpellOperation {
  type: "castSpell";
  entryId: string;
  slotLevel?: number; // required for leveled spells, omit/ignore for cantrips
  roll: number;       // client-rolled total (0 for utility)
  /**
   * Optionally apply the rolled effect in the same atomic batch. `target: "self"`
   * hits the caster's own HP; `target: { characterId }` heals a consenting ally's
   * sheet (#462, healing only). Omitted when targeting an enemy (no enemy entities
   * exist; the player relays damage to the DM).
   */
  apply?: { target: CastTarget; kind: "heal" | "damage"; amount: number };
}

/**
 * Cast a spell granted by a held magic item (#528). `entryId` is the derived
 * `item:<inventoryItemId>:<spellId>` seam. Spends the item's own resource (its
 * per-capability `used` counter), never a character spell slot. `roll` is the
 * client-computed effect total (0 for utility). Blocked when the item is inactive
 * (not equipped/attuned) or its uses are exhausted until the matching rest.
 */
export interface CastItemSpellOperation {
  type: "castItemSpell";
  entryId: string;
  roll: number;
  apply?: { target: CastTarget; kind: "heal" | "damage"; amount: number };
}

/** Expend one slot of a given level without associating it with a specific spell. */
export interface ExpendSlotOperation {
  type: "expendSlot";
  level: number;
}

/** Restore one previously-expended slot (undo mis-click; not Arcane Recovery). */
export interface RestoreSlotOperation {
  type: "restoreSlot";
  level: number;
}

/** Learn a spell from the catalog (spellId) or add a custom one. Exactly one of spellId/custom. */
export interface LearnSpellOperation {
  type: "learnSpell";
  spellId?: string;
  custom?: CustomSpellInput;
}

/** Remove a learned spell by its per-character entry id. */
export interface ForgetSpellOperation {
  type: "forgetSpell";
  entryId: string;
}

/** Mark a non-cantrip spell as prepared. */
export interface PrepareSpellOperation {
  type: "prepareSpell";
  entryId: string;
}

/** Mark a non-cantrip spell as unprepared. */
export interface UnprepareSpellOperation {
  type: "unprepareSpell";
  entryId: string;
}

/** End the active concentration spell manually (player ends it / it was countered). */
export interface DropConcentrationOperation {
  type: "dropConcentration";
}

/** Dismiss an active while-active spell buff by its spell entry id (#363). */
export interface DismissBuffOperation {
  type: "dismissBuff";
  entryId: string;
}

/**
 * Sorcerer Font of Magic (#903): convert sorcery points into a spell slot at the
 * 5e cost table, or expend a spell slot to gain SP equal to its level. Mutates
 * the SP pool (resources) and the slot state (spellcasting) atomically.
 */
export interface ConvertSorceryPointsOperation {
  type: "convertSorceryPoints";
  direction: "toSlot" | "toSorceryPoints";
  slotLevel: number;
}

export type SpellcastingOperation =
  | CastSpellOperation
  | CastItemSpellOperation
  | ExpendSlotOperation
  | RestoreSlotOperation
  | LearnSpellOperation
  | ForgetSpellOperation
  | PrepareSpellOperation
  | UnprepareSpellOperation
  | DropConcentrationOperation
  | DismissBuffOperation
  | ConvertSorceryPointsOperation;

// Each helper mutates ctx.state in place and returns an OpOutcome, or null for a
// no-op (which skips both the state write-back and the logEvent in the dispatcher).

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
  // Derived prepared-spell cap (#883). Null for known/pact/third casters.
  preparedSpellLimit: number | null;
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

// Normalize a nullable catalog column to the SpellEntry's optional (undefined).
const orUndef = <T>(v: T | null): T | undefined => v ?? undefined;

// Snapshot a catalog Spell row into a new learned SpellEntry (buff fields #363).
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

// Build a learned SpellEntry from custom DM-authored input.
function customSpellToEntry(custom: CustomSpellInput): SpellEntry {
  return {
    id: randomUUID(),
    name: custom.name,
    level: custom.level,
    school: custom.school,
    prepared: false,
    castingTime: custom.castingTime,
    range: custom.range,
    duration: custom.duration,
    description: custom.description,
    concentration: custom.concentration,
    ritual: custom.ritual,
    components: custom.components,
    saveEffect: custom.saveEffect,
    effectKind: custom.effectKind,
    effectDiceCount: custom.effectDiceCount,
    effectDiceFaces: custom.effectDiceFaces,
    effectModifier: custom.effectModifier,
    damageType: custom.damageType,
    attackType: custom.attackType,
    saveAbility: custom.saveAbility,
    upcastDicePerLevel: custom.upcastDicePerLevel,
    cantripScaling: custom.cantripScaling,
  };
}

// Reject a duplicate, look up the catalog row, and snapshot it into an entry.
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

async function applyLearnSpellOp(ctx: SpellOpContext, op: LearnSpellOperation): Promise<OpOutcome> {
  const { tx, state } = ctx;
  if (Boolean(op.spellId) === Boolean(op.custom)) {
    throw new InvalidSpellcastingOperationError(
      "learnSpell: provide exactly one of spellId or custom"
    );
  }
  const newEntry = op.spellId
    ? await resolveCatalogSpellEntry(tx, state, op.spellId)
    : customSpellToEntry(op.custom!);
  state.spells.push(newEntry);
  return {
    eventType: "learnSpell",
    summary: `Learned ${newEntry.name}`,
    eventData: { entryId: newEntry.id, spellName: newEntry.name, spellId: newEntry.spellId ?? null },
  };
}

async function applyForgetSpellOp(ctx: SpellOpContext, op: ForgetSpellOperation): Promise<OpOutcome> {
  const { state } = ctx;
  // Subclass-granted spells are derived, not persisted — they cannot be forgotten.
  const idx = state.spells.findIndex((s) => s.id === op.entryId);
  if (op.entryId.startsWith("granted:") || state.spells[idx]?.source === "subclass") {
    throw new InvalidSpellcastingOperationError("Cannot forget a subclass-granted spell.");
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
        `You can prepare at most ${ctx.preparedSpellLimit} spells (spellcasting modifier + level).`,
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

// Thin wrapper over the shared castAbilityInTx: cantrips cost nothing, leveled
// spells cost a slot (with Mystic Arcanum fallback in the payer). The shared
// caster formats the summary, drops/sets concentration, and self-applies.
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

// Cast a spell granted by a held item (#528). Adapts the item's castSpell
// capability into a CastAbilityInput: effect = the referenced Spell's EffectSpec,
// cost = none (the item resource is spent here, not a character slot), DC/attack
// per the fixed/wielder mode. Decrements the item's per-capability use counter —
// or, for a charges-costed cast (#555), the item's shared pool by chargeCost.
// A held item spell resolved and validated for casting: the entry, its item
// meta, the referenced catalog spell, and the resolved cost/DC/attack.
interface ResolvedItemSpell {
  entry: SpellEntry;
  meta: ItemSpellMeta;
  spell: Spell;
  chargeCost: number | null;
  dc: number | null;
  attack: number | null;
}

// The item resource-use snapshot folded into the event for undo refunds (#580).
interface ItemResourceSpend {
  poolUsedAfter: number | null;
  capabilityUsedBefore: { capabilityId: string; used: number } | null;
  capabilityUsedAfter: { capabilityId: string; used: number } | null;
}

// Throw unless the item has enough remaining uses/charges for this cast.
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

// Resolve the announced DC/attack: fixed uses the item's value, wielder the
// character's own (null-safe: a non-caster wielder is prevented at authoring).
function resolveItemDcAttack(
  ctx: SpellOpContext,
  meta: ItemSpellMeta,
): { dc: number | null; attack: number | null } {
  return {
    dc: meta.dcMode === "wielder" ? ctx.wielderSpellSaveDC : meta.dc ?? null,
    attack: meta.attackMode === "wielder" ? ctx.wielderSpellAttackBonus : meta.attack ?? null,
  };
}

// Find the item spell entry, validate availability + remaining uses, load the
// referenced catalog spell, and resolve the announced DC/attack.
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
// blob. Charges-costed casts increment the shared POOL row by chargeCost;
// everything else increments the capability's own per-period counter by 1.
// Snapshot the row's used counter before/after so undo can refund it (#580) —
// mirrors the #555 activate-op capabilityUsed pattern.
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
    const spent = await ctx.tx.inventoryCapability.updateMany({
      where: { id: meta.poolCapabilityId, used: { lte: meta.usesTotal - chargeCost } },
      data: { used: { increment: chargeCost } },
    });
    if (spent.count === 0) {
      throw new InvalidSpellcastingOperationError(
        `${entry.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — ${meta.itemName} has too few remaining`,
      );
    }
    // Re-read for the event data: under a race the pre-tx snapshot is stale.
    const fresh = await ctx.tx.inventoryCapability.findUniqueOrThrow({
      where: { id: meta.poolCapabilityId },
      select: { used: true },
    });
    poolUsedAfter = fresh.used;
    capabilityUsedBefore = { capabilityId: meta.poolCapabilityId, used: fresh.used - chargeCost };
    capabilityUsedAfter = { capabilityId: meta.poolCapabilityId, used: fresh.used };
  } else if (meta.usesTotal !== Infinity) {
    const updated = await ctx.tx.inventoryCapability.update({
      where: { id: meta.capabilityId },
      data: { used: { increment: 1 } },
      select: { used: true },
    });
    capabilityUsedBefore = { capabilityId: meta.capabilityId, used: updated.used - 1 };
    capabilityUsedAfter = { capabilityId: meta.capabilityId, used: updated.used };
  }
  return { poolUsedAfter, capabilityUsedBefore, capabilityUsedAfter };
}

// Fold the item-cast DC/attack text, the capability-used snapshot (undo refund,
// #580), and the item provenance into the cast outcome.
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
  // Gain SP = slot level; restoreResource caps at max (never exceed the pool).
  await applyResourceOpInTx(tx, characterId, { type: "restoreResource", key: "sorceryPoints", amount: level }, batchId, sessionId);
  return {
    eventType: "convertSorceryPoints",
    summary: `Converted a level-${level} spell slot into ${level} sorcery points`,
    eventData: { direction: "toSorceryPoints", slotLevel: level, sorceryPointsGained: level },
  };
}

type DerivedSpellcasting = ReturnType<typeof deriveSpellcasting>;

// Build the slot/arcana level→total maps from derived spellcasting, falling back
// to any stored legacy totals for unsupported caster classes.
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

// Inject derived subclass-granted (#438) + item-granted (#528) spells into the
// working state so ops that target them resolve. Disjoint id spaces; stripped
// again before persist (persistSpellState) — they live only in the read view.
function injectDerivedSpells(
  state: SpellcastingMutableState,
  subclassRef: GrantedSpellSource | null | undefined,
  level: number,
  itemSources: ItemSpellSourceItem[],
): void {
  const granted = deriveGrantedSpells(subclassRef, level);
  if (granted.length > 0) {
    const names = new Set(state.spells.map((s) => s.name.toLowerCase()));
    for (const g of granted) if (!names.has(g.name.toLowerCase())) state.spells.push(g);
  }
  for (const s of deriveItemSpells(itemSources)) state.spells.push(s);
}

// Shallow-clone the mutable state for an event before/after snapshot.
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

// Strip derived grants + item spells (re-derived on read) and persist the state.
async function persistSpellState(
  tx: Prisma.TransactionClient,
  characterId: string,
  state: SpellcastingMutableState,
): Promise<void> {
  state.spells = state.spells.filter((s) => s.source !== "subclass" && s.source !== "item");
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

/**
 * Applies a batch of spellcasting operations atomically in one Prisma
 * transaction. Mirrors applyInventoryOperations / applyHitPointOperations:
 *   - one batchId groups all ops in this request on the activity timeline
 *   - any throw rolls back the entire batch (state unchanged)
 *   - a CharacterEvent is logged per op (with full before/after spellcasting
 *     snapshot for revert symmetry with the HP/XP undo handler)
 *   - the mutable state is loaded once and written once per op loop iteration
 *     (loading inside the loop ensures each op sees the previous op's result)
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
  experiencePoints: true,
  abilityScores: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    // All entries (not just the primary) so the multiclass prepared-cap sum works.
    select: {
      name: true,
      level: true,
      subclass: true,
      // Subclass-granted spells (#898) injected into the working view below.
      subclassRef: { include: { grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } } } },
    },
  },
  inventoryItems: {
    select: { id: true, name: true, equippedSlot: true, attuned: true, capabilities: true },
  },
} satisfies Prisma.CharacterSelect;

type SpellcastingRow = Prisma.CharacterGetPayload<{ select: typeof SPELLCASTING_SELECT }>;

// Read fresh state and assemble the per-op context + before-snapshot. Split out
// of applySpellcastingOpInTx to keep that seam under the unit-size gate.
function buildSpellcastingOp(
  ids: { tx: Prisma.TransactionClient; characterId: string; batchId: string; sessionId: string | null; casterUserId: string },
  row: SpellcastingRow,
): { ctx: SpellOpContext; state: SpellcastingMutableState; beforeState: SpellStateSnapshot } {
  // Derived stats needed for slot-bounds checks.
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const className = row.classEntries[0]?.name ?? "";
  const abilityScores = row.abilityScores as Record<string, number>;
  const derived = deriveSpellcasting(className, level, abilityScores, profBonus);
  // Single-class uses the XP-derived level (per-class column can be stale) so the
  // enforced cap matches the serialized limit; multiclass uses per-entry levels.
  const limitEntries = row.classEntries.length === 1
    ? [{ name: className, level, subclass: row.classEntries[0]?.subclass ?? null }]
    : row.classEntries.map((e) => ({ name: e.name, level: e.level, subclass: e.subclass }));
  const preparedSpellLimit = derivePreparedSpellLimit(limitEntries, abilityScores);

  const { slotTotals, arcanaTotals } = computeSlotTables(row.spellcasting, derived);

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const beforeState = cloneSpellState(state);

  injectDerivedSpells(
    state,
    row.classEntries[0]?.subclassRef,
    level,
    row.inventoryItems.map((i) => ({
      id: i.id,
      name: i.name,
      // #565: `equipped` is derived from equippedSlot (no persisted boolean).
      equipped: i.equippedSlot != null,
      attuned: i.attuned,
      capabilities: i.capabilities,
    })),
  );

  const ctx = buildSpellOpContext(ids, row, state, slotTotals, arcanaTotals, derived, preparedSpellLimit);
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
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: SPELLCASTING_SELECT,
  });
  if (!row) {
    throw new InvalidSpellcastingOperationError(`Character not found: ${characterId}`);
  }

  const { ctx, state, beforeState } = buildSpellcastingOp(
    { tx, characterId, batchId, sessionId, casterUserId },
    row,
  );

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
