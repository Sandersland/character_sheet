/**
 * Spellcasting transaction handler — the spellcasting counterpart to
 * lib/inventory.ts and lib/hitpoints.ts.
 *
 * The per-character mutable spell state lives in a single JSON column
 * (Character.spellcasting) rather than relational rows — see the plan note
 * in CLAUDE.md. This keeps revert/undo identical to the HP/XP undo pattern
 * (restore `before.spellcasting` from a CharacterEvent) and avoids a new
 * `CharacterSpell` table.
 *
 * What is persisted: slot `used` counts and the learned `spells[]` array.
 * What is derived at read time (in lib/character-serialize.ts serializeCharacter):
 *   - slot totals (from srd.ts FULL_CASTER_SLOTS + class + level)
 *   - spellSaveDC / spellAttackBonus / ability (from srd.ts deriveSpellcasting)
 */

import { randomUUID } from "node:crypto";


import { Prisma } from "../generated/prisma/client.js";
import { castAbilityInTx, type CastTarget, type OpOutcome } from "./ability-cast.js";
import { clearBuffsForSourceInTx } from "./active-effects.js";
import { InvalidSpellcastingOperationError, type AbilityCost, type PayCostContext } from "./ability-cost.js";
import { runCharacterTransaction } from "./character-transaction.js";
import { readEffectSpec } from "./effects.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { logEvent } from "./events.js";
import { normalizeSpellcastingMutable } from "./spell-state.js";
import { deriveGrantedSpells, deriveItemSpells } from "./granted-spells.js";
import type {
  SpellEntry,
  SpellComponents,
  SpellcastingMutableState,
} from "./spell-state.js";
import { deriveSpellcasting } from "./srd.js";

// ── Error class ───────────────────────────────────────────────────────────────
// Defined in ability-cost.ts (one-directional dep graph); re-exported so
// existing importers (routes/spellcasting.ts) keep resolving it here unchanged.
export { InvalidSpellcastingOperationError };

// Persisted spell state shape + normalizer live in the leaf module spell-state.ts
// (extracted to break the hitpoints ↔ spellcasting import cycle). Re-exported
// here so this module's public surface stays stable.
export { normalizeSpellcastingMutable };

// ── Custom spell input shape ──────────────────────────────────────────────────
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

// ── Operation types ───────────────────────────────────────────────────────────

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

export type SpellcastingOperation =
  | CastSpellOperation
  | CastItemSpellOperation
  | ExpendSlotOperation
  | RestoreSlotOperation
  | LearnSpellOperation
  | ForgetSpellOperation
  | PrepareSpellOperation
  | UnprepareSpellOperation
  | DropConcentrationOperation;

// ── Per-op helper context + outcome ───────────────────────────────────────────
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

async function applyLearnSpellOp(ctx: SpellOpContext, op: LearnSpellOperation): Promise<OpOutcome> {
  const { tx, state } = ctx;
  if (Boolean(op.spellId) === Boolean(op.custom)) {
    throw new InvalidSpellcastingOperationError(
      "learnSpell: provide exactly one of spellId or custom"
    );
  }

  let newEntry: SpellEntry;

  if (op.spellId) {
    // Check for duplicate before DB lookup.
    if (state.spells.some((s) => s.spellId === op.spellId)) {
      throw new InvalidSpellcastingOperationError(
        `Spell already in spellbook (spellId: ${op.spellId})`
      );
    }
    const catalogSpell = await tx.spell.findUnique({ where: { id: op.spellId } });
    if (!catalogSpell) {
      throw new InvalidSpellcastingOperationError(`Spell not found in catalog: ${op.spellId}`);
    }
    newEntry = {
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
      components: (catalogSpell.components as SpellComponents | null) ?? undefined,
      saveEffect: catalogSpell.saveEffect ?? undefined,
      effectKind: catalogSpell.effectKind ?? undefined,
      effectDiceCount: catalogSpell.effectDiceCount ?? undefined,
      effectDiceFaces: catalogSpell.effectDiceFaces ?? undefined,
      effectModifier: catalogSpell.effectModifier ?? undefined,
      damageType: catalogSpell.damageType ?? undefined,
      attackType: catalogSpell.attackType ?? undefined,
      saveAbility: catalogSpell.saveAbility ?? undefined,
      upcastDicePerLevel: catalogSpell.upcastDicePerLevel ?? undefined,
      cantripScaling: catalogSpell.cantripScaling,
    };
  } else {
    // Custom spell.
    const custom = op.custom!;
    newEntry = {
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
async function applyCastItemSpellOp(ctx: SpellOpContext, op: CastItemSpellOperation): Promise<OpOutcome> {
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
  if (!entry.spellId) {
    throw new InvalidSpellcastingOperationError(`Item spell ${op.entryId} has no referenced spell`);
  }
  const spell = await ctx.tx.spell.findUnique({ where: { id: entry.spellId } });
  if (!spell) {
    throw new InvalidSpellcastingOperationError(`Referenced spell not found in catalog: ${entry.spellId}`);
  }

  // Resolve the announced DC/attack: fixed uses the item's value, wielder the
  // character's own (null-safe: a non-caster wielder is prevented at authoring).
  const dc = meta.dcMode === "wielder" ? ctx.wielderSpellSaveDC : meta.dc ?? null;
  const attack = meta.attackMode === "wielder" ? ctx.wielderSpellAttackBonus : meta.attack ?? null;

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

  // Spend the item's resource (skip for at-will), persisted outside the spell
  // blob. Charges-costed casts increment the shared POOL row by chargeCost;
  // everything else increments the capability's own per-period counter by 1.
  if (chargeCost != null) {
    if (!meta.poolCapabilityId) {
      throw new InvalidSpellcastingOperationError(`${meta.itemName} has no charges pool to spend from`);
    }
    await ctx.tx.inventoryCapability.update({
      where: { id: meta.poolCapabilityId },
      data: { used: { increment: chargeCost } },
    });
  } else if (meta.usesTotal !== Infinity) {
    await ctx.tx.inventoryCapability.update({
      where: { id: meta.capabilityId },
      data: { used: { increment: 1 } },
    });
  }

  const dcText = dc != null ? ` (DC ${dc})` : attack != null ? ` (+${attack} to hit)` : "";
  outcome.summary += dcText;
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
          chargesRemaining: meta.usesRemaining - chargeCost,
        }
      : {}),
  };
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

// ── Transaction handler ───────────────────────────────────────────────────────

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
  await runCharacterTransaction(characterId, operations, {
    select: {
      name: true,
      campaignId: true,
      spellcasting: true,
      experiencePoints: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true, subclass: true },
      },
      inventoryItems: {
        select: { id: true, name: true, equippedSlot: true, attuned: true, capabilities: true },
      },
    },
    notFound: (id) => new InvalidSpellcastingOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      // Derived stats needed for slot-bounds checks.
      const level = levelForExperience(row.experiencePoints);
      const profBonus = proficiencyBonusForLevel(level);
      const className = row.classEntries[0]?.name ?? "";
      const abilityScores = row.abilityScores as Record<string, number>;
      const derived = deriveSpellcasting(className, level, abilityScores, profBonus);

      // Slot totals map: level → total (0 if no entry).
      const slotTotals: Record<number, number> = {};
      // Mystic Arcanum totals map: spell level → charges (Warlock only).
      const arcanaTotals: Record<number, number> = {};
      if (derived) {
        for (const s of derived.slotTotals) slotTotals[s.level] = s.total;
        for (const a of derived.arcana) arcanaTotals[a.level] = a.total;
      } else if (row.spellcasting && typeof row.spellcasting === "object" && !Array.isArray(row.spellcasting)) {
        // Fallback for unsupported caster classes: read stored totals if present.
        const stored = row.spellcasting as Record<string, unknown>;
        const oldSlots = (stored.slots as Array<{ level: number; total: number }>) ?? [];
        for (const s of oldSlots) slotTotals[s.level] = s.total;
      }

      const state = normalizeSpellcastingMutable(row.spellcasting);
      const beforeState = {
        spellcasting: {
          ...state,
          slotsUsed: { ...state.slotsUsed },
          arcanumUsed: { ...state.arcanumUsed },
          spells: [...state.spells],
          concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
        },
      };

      // Inject derived subclass-granted spells into the working state so ops that
      // target them (e.g. casting a Way of Shadow monk's Minor Illusion) resolve.
      // These are stripped again before persist — they live only in the read view.
      const granted = deriveGrantedSpells(className, row.classEntries[0]?.subclass ?? undefined, level);
      if (granted.length > 0) {
        const names = new Set(state.spells.map((s) => s.name.toLowerCase()));
        for (const g of granted) if (!names.has(g.name.toLowerCase())) state.spells.push(g);
      }
      // Inject derived item-granted spells (#528) so castItemSpell resolves them;
      // their `item:` ids are disjoint, so they're stripped (with grants) pre-persist.
      const itemSpells = deriveItemSpells(
        row.inventoryItems.map((i) => ({
          id: i.id,
          name: i.name,
          // #565: `equipped` is derived from equippedSlot (no persisted boolean).
          equipped: i.equippedSlot != null,
          attuned: i.attuned,
          capabilities: i.capabilities,
        })),
      );
      for (const s of itemSpells) state.spells.push(s);

      const ctx: SpellOpContext = {
        tx,
        characterId,
        batchId,
        sessionId,
        state,
        slotTotals,
        arcanaTotals,
        casterUserId,
        casterName: row.name,
        casterCampaignId: row.campaignId,
        wielderSpellSaveDC: derived?.spellSaveDC ?? null,
        wielderSpellAttackBonus: derived?.spellAttackBonus ?? null,
      };

      // Route to the per-op helper. A null outcome means no-op — skip both the
      // state write-back and the logEvent below.
      let outcome: OpOutcome | null = null;
      switch (op.type) {
        case "castSpell": outcome = await applyCastSpellOp(ctx, op); break;
        case "castItemSpell": outcome = await applyCastItemSpellOp(ctx, op); break;
        case "expendSlot": outcome = applyExpendSlotOp(ctx, op); break;
        case "restoreSlot": outcome = applyRestoreSlotOp(ctx, op); break;
        case "learnSpell": outcome = await applyLearnSpellOp(ctx, op); break;
        case "forgetSpell": outcome = await applyForgetSpellOp(ctx, op); break;
        case "prepareSpell":
        case "unprepareSpell": outcome = applyPrepareSpellOp(ctx, op); break;
        case "dropConcentration": outcome = await applyDropConcentrationOp(ctx); break;
      }
      if (outcome === null) return;

      // Strip derived grants + item spells before persisting — they are never
      // stored (both re-derived on read; reconcileGrantedSpells guards leaks).
      state.spells = state.spells.filter((s) => s.source !== "subclass" && s.source !== "item");

      // Write the updated state back as a compact object.
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

      const afterState = {
        spellcasting: {
          slotsUsed: { ...state.slotsUsed },
          arcanumUsed: { ...state.arcanumUsed },
          spells: [...state.spells],
          concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
        },
      };

      await logEvent(tx, {
        characterId,
        category: "spellcasting",
        type: outcome.eventType as Parameters<typeof logEvent>[1]["type"],
        summary: outcome.summary,
        before: beforeState,
        after: afterState,
        data: outcome.eventData,
        batchId,
        sessionId,
      });
    },
  });
}
