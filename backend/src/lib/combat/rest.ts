import { Prisma } from "@/generated/prisma/client.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { rollDie } from "@/lib/core/dice.js";
import { deriveEntryScopedResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import {
  snapshotResources,
  normalizeResourcesMutable,
  serializeResourcesState,
  clearInitiativeRegenMarkers,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { deriveMulticlassSpellcasting } from "@/lib/srd/spellcasting-tables.js";
import {
  normalizeConditionsMutable,
  serializeConditionsState,
  type ConditionsMutableState,
} from "./conditions.js";
import {
  castResourceRechargesOn,
  chargeTriggerRechargesOn,
  readCapability,
  type CapabilityColumns,
} from "@/lib/inventory/capabilities.js";
import { InvalidHitPointOperationError, hitDieHeal, type HitDice } from "./hp-core.js";
import type { ShortRestOperation } from "./hp-operations.js";
import type { HpOpContext, HpOpResult } from "./hp-context.js";

type InventoryItemRow = NonNullable<HpOpContext["row"]["inventoryItems"]>[number];

// The active item castSpell capability columns whose resource recharges on this
// rest, with the charges each would restore (#528). Inactive items (neither
// equipped nor attuned, #565) contribute nothing.
function itemSpellCapsToReset(
  item: InventoryItemRow,
  rest: "short" | "long",
): { restored: number; ids: string[] } {
  if (item.equippedSlot == null && !item.attuned) return { restored: 0, ids: [] };
  let restored = 0;
  const ids: string[] = [];
  for (const col of item.capabilities) {
    const cap = readCapability(col);
    if (cap.kind !== "castSpell") continue;
    if (!castResourceRechargesOn(cap.resource, rest)) continue;
    const used = col.used ?? 0;
    if (used > 0) {
      restored += used;
      ids.push(col.id);
    }
  }
  return { restored, ids };
}

// Reset the per-capability `used` counter of any active item castSpell whose
// resource recharges on this rest (#528). Returns how many charges were restored.
async function resetItemSpellUsesOnRest(
  ctx: Pick<HpOpContext, "tx" | "row">,
  rest: "short" | "long",
): Promise<number> {
  let restored = 0;
  const ids: string[] = [];
  for (const item of ctx.row.inventoryItems ?? []) {
    const caps = itemSpellCapsToReset(item, rest);
    restored += caps.restored;
    ids.push(...caps.ids);
  }
  if (ids.length > 0) {
    await ctx.tx.inventoryCapability.updateMany({ where: { id: { in: ids } }, data: { used: 0 } });
  }
  return restored;
}

// Per-pool before/after snapshot entries for the rest event (undo restores `used`).
interface ChargePoolSnapshot {
  capabilityId: string;
  itemName: string;
  used: number;
}

// Charges regained by one pool's recharge formula: a dice roll (+ flat bonus),
// a fixed bonus alone ("regains 1 charge daily at dawn"), or — when neither is
// set — a full refill (`used`, so the pool always bottoms out at 0).
function computeChargePoolRegain(
  cap: { rechargeDice?: { count: number; faces: number } | null; rechargeBonus?: number | null },
  used: number,
): number {
  if (cap.rechargeDice) {
    let regained = cap.rechargeBonus ?? 0;
    for (let i = 0; i < cap.rechargeDice.count; i++) regained += rollDie(cap.rechargeDice.faces);
    return regained;
  }
  if (cap.rechargeBonus) return cap.rechargeBonus;
  return used;
}

// Recharge one item's charge-pool capability if its trigger fires on this rest.
// Returns null when the column isn't an active pool (wrong kind, already empty,
// wrong trigger) or the regain wouldn't change `used`.
async function rechargeOneChargePool(
  tx: Prisma.TransactionClient,
  itemName: string,
  col: CapabilityColumns & { id: string; used?: number | null },
  rest: "short" | "long",
): Promise<{ before: ChargePoolSnapshot; after: ChargePoolSnapshot } | null> {
  const cap = readCapability(col);
  if (cap.kind !== "charges") return null;
  const used = col.used ?? 0;
  if (used <= 0) return null;
  if (!chargeTriggerRechargesOn(cap.rechargeTrigger, rest)) return null;
  const regained = computeChargePoolRegain(cap, used);
  const nextUsed = Math.max(0, used - regained);
  if (nextUsed === used) return null;
  await tx.inventoryCapability.update({ where: { id: col.id }, data: { used: nextUsed } });
  return {
    before: { capabilityId: col.id, itemName, used },
    after: { capabilityId: col.id, itemName, used: nextUsed },
  };
}

// Recharge item charge pools (#555) whose trigger fires on this rest: regain the
// server-rolled dice formula (dice-less + bonus-less = full refill) capped at max,
// i.e. used = max(0, used − regained). Dawn/dusk approximate to a long rest (the
// app's standing convention). Deliberately NOT gated on equipped/attuned — a wand
// in the bag still recharges at dawn (same reasoning as consumable recharge).
async function rechargeItemChargePoolsOnRest(
  ctx: Pick<HpOpContext, "tx" | "row">,
  rest: "short" | "long",
): Promise<{ recharged: number; before: ChargePoolSnapshot[]; after: ChargePoolSnapshot[] }> {
  const before: ChargePoolSnapshot[] = [];
  const after: ChargePoolSnapshot[] = [];
  let recharged = 0;
  for (const item of ctx.row.inventoryItems ?? []) {
    for (const col of item.capabilities) {
      const result = await rechargeOneChargePool(ctx.tx, item.name, col, rest);
      if (!result) continue;
      before.push(result.before);
      after.push(result.after);
      recharged += result.before.used - result.after.used;
    }
  }
  return { recharged, before, after };
}

// applyShortRestOp / applyLongRestOp share the same anatomy: HP/hit-dice math,
// then a series of independent restore phases (class resource pools, spell
// slots, item resets), then eventData + summary assembly, then one
// spellcasting/resources write. Each phase is a helper returning plain data;
// the two ops differ only in which phases run and with which rest kind.

/** Does a class-resource pool recharge on this rest? "short-or-long" fires on both. */
function poolRechargesOn(recharge: string, rest: "short" | "long"): boolean {
  if (recharge === "short-or-long") return true;
  return recharge === (rest === "short" ? "shortRest" : "longRest");
}

/**
 * Derive EVERY class entry's resource pools (recharge schedule included), each
 * scaled to its own effective level (#1072) — reuses #1071's entry-scoped pool
 * derivation rather than re-deriving from the primary entry alone, so a
 * secondary class's pools recharge too (PHB'24 p.163: each class's pool scales
 * to that class's own level).
 */
function deriveRestPools(row: HpOpContext["row"]): DerivedClassInfo | null {
  const level = levelForExperience(row.experiencePoints);
  const { derived } = deriveEntryScopedResources(
    row.classEntries,
    level,
    row.abilityScores as Record<string, number>,
    proficiencyBonusForLevel(level),
  );
  return derived;
}

/**
 * Reset class resource pools that recharge on this rest (e.g. Battle Master
 * superiority dice on short, Rage on long; "short-or-long" fires on both).
 * Mutates and returns the normalized state for the caller to serialize; the
 * before-state deep-clone feeds the event snapshot that undo restores.
 */
function resetRestResources(
  row: HpOpContext["row"],
  rest: "short" | "long",
): { state: ResourcesMutableState; beforeResourceState: ResourcesMutableState; resourcesRestored: number } {
  const derivedRes = deriveRestPools(row);
  const state = normalizeResourcesMutable(row.resources);
  const beforeResourceState = snapshotResources(state);
  let resourcesRestored = 0;
  for (const pool of derivedRes?.resources ?? []) {
    if (poolRechargesOn(pool.recharge, rest)) {
      resourcesRestored += state.used[pool.key] ?? 0;
      state.used[pool.key] = 0;
    }
  }
  // A long rest resets the once-per-long-rest initiative-regen cap (#1239) so
  // the next combat's regen (e.g. Uncanny Metabolism) can fire again.
  if (rest === "long") clearInitiativeRegenMarkers(state);
  return { state, beforeResourceState, resourcesRestored };
}

/** Deep-clone of the mutable spellcasting state for a rest event's before snapshot. */
function cloneSpellStateForRest(spellState: ReturnType<typeof normalizeSpellcastingMutable>): Record<string, unknown> {
  return {
    slotsUsed: { ...spellState.slotsUsed },
    arcanumUsed: { ...spellState.arcanumUsed },
    spells: spellState.spells.map((s) => ({ ...s })),
    concentratingOn: spellState.concentratingOn ? { ...spellState.concentratingOn } : null,
  };
}

/**
 * Warlock Pact Magic slots recharge on a short rest, fired when ANY class
 * entry is a Warlock (#1072 — used to gate on the primary entry only). A pure
 * (single-class) Warlock's only spell slots are Pact slots, so clearing
 * slotsUsed wholesale is safe. Multiclass keeps a shared caster pool alongside
 * Pact Magic under the same slotsUsed map (#123 already separates them in the
 * wire view), so only the Warlock entry's own Pact slot-level key is cleared —
 * the shared pool stays long-rest-only. Mystic Arcanum is long-rest only and
 * concentration survives a short rest — both preserved either way. Returns
 * null for non-Warlocks (no spellcasting write, no snapshot).
 */
function restoreWarlockPactSlots(row: HpOpContext["row"]): {
  beforeSpellState: Record<string, unknown>;
  slotsRestored: number;
  spellcasting: Prisma.InputJsonValue;
} | null {
  const isWarlock = row.classEntries.some((e) => e.name.toLowerCase() === "warlock");
  if (!isWarlock) return null;
  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const beforeSpellState = cloneSpellStateForRest(spellState);

  let slotsRestored: number;
  if (row.classEntries.length <= 1) {
    slotsRestored = Object.values(spellState.slotsUsed).reduce((s, n) => s + n, 0);
    spellState.slotsUsed = {};
  } else {
    const abilityScores = row.abilityScores as Record<string, number>;
    const profBonus = proficiencyBonusForLevel(levelForExperience(row.experiencePoints));
    const pactSlotLevel = deriveMulticlassSpellcasting(row.classEntries, abilityScores, profBonus).pact?.slotLevel;
    if (pactSlotLevel === undefined) return null;
    const key = String(pactSlotLevel);
    slotsRestored = spellState.slotsUsed[key] ?? 0;
    delete spellState.slotsUsed[key];
  }

  return {
    beforeSpellState,
    slotsRestored,
    spellcasting: {
      slotsUsed: spellState.slotsUsed,
      arcanumUsed: spellState.arcanumUsed,
      spells: spellState.spells,
      concentratingOn: spellState.concentratingOn,
    } as unknown as Prisma.InputJsonValue,
  };
}

/** The item resets every rest runs: castSpell use resets (#528) + charge pools (#555). */
async function runItemRestResets(
  ctx: Pick<HpOpContext, "tx" | "row">,
  rest: "short" | "long",
): Promise<{ itemSpellsRestored: number; chargePools: Awaited<ReturnType<typeof rechargeItemChargePoolsOnRest>> }> {
  const itemSpellsRestored = await resetItemSpellUsesOnRest(ctx, rest);
  const chargePools = await rechargeItemChargePoolsOnRest(ctx, rest);
  return { itemSpellsRestored, chargePools };
}

/** The `...(cond ? {} : {})` charge-pool eventData fragment shared by both rests. */
function chargePoolEventData(
  chargePools: Awaited<ReturnType<typeof rechargeItemChargePoolsOnRest>>,
): Record<string, unknown> {
  return chargePools.recharged > 0
    ? {
        itemChargesRecharged: chargePools.recharged,
        chargePoolsBefore: chargePools.before,
        chargePoolsAfter: chargePools.after,
      }
    : {};
}

/** Validate a short rest's hit-die spend against availability and die size. */
function validateHitDiceSpend(op: ShortRestOperation, hd: HitDice, faces: number): void {
  const available = hd.total - hd.spent;
  const spending = op.rolls.length;
  if (spending > available) {
    throw new InvalidHitPointOperationError(
      `Cannot spend ${spending} hit dice; only ${available} available`
    );
  }
  if (op.rolls.some((r) => r < 1 || r > faces)) {
    throw new InvalidHitPointOperationError(
      `Hit die rolls must be between 1 and ${faces} (die: ${hd.die})`
    );
  }
}

/** "Short rest — spent N hit dice: +X HP, …" with the parts in fixed order. */
function buildShortRestSummary(
  spending: number,
  totalGain: number,
  slotsRestored: number,
  resourcesRestored: number,
  items: { itemSpellsRestored: number; chargePools: { recharged: number } },
): string {
  const restParts: string[] = [`+${totalGain} HP`];
  if (slotsRestored > 0) restParts.push(`${slotsRestored} Pact slot${slotsRestored !== 1 ? "s" : ""} restored`);
  if (resourcesRestored > 0) restParts.push(`resources restored`);
  if (items.itemSpellsRestored > 0) restParts.push(`item spells restored`);
  if (items.chargePools.recharged > 0) restParts.push(`item charges recharged`);
  return `Short rest — spent ${spending} hit ${spending === 1 ? "die" : "dice"}: ${restParts.join(", ")}`;
}

export async function applyShortRestOp(ctx: HpOpContext, op: ShortRestOperation): Promise<HpOpResult> {
  const { tx, characterId, row, hp, hd, conMod, faces, effMax } = ctx;
  validateHitDiceSpend(op, hd, faces);
  const spending = op.rolls.length;
  const totalGain = op.rolls.reduce((sum, roll) => sum + hitDieHeal(roll, conMod), 0);
  hp.current = Math.min(effMax, hp.current + totalGain);
  hd.spent += spending;

  const resources = resetRestResources(row, "short");
  const pact = restoreWarlockPactSlots(row);
  const slotsRestored = pact?.slotsRestored ?? 0;
  const items = await runItemRestResets(ctx, "short");

  const eventData: Record<string, unknown> = {
    rolls: op.rolls,
    totalGain,
    conMod,
    resourcesRestored: resources.resourcesRestored,
    slotsRestored,
    itemSpellsRestored: items.itemSpellsRestored,
    beforeResourceState: resources.beforeResourceState,
    ...(pact ? { beforeSpellState: pact.beforeSpellState } : {}),
    ...chargePoolEventData(items.chargePools),
  };
  const summary = buildShortRestSummary(spending, totalGain, slotsRestored, resources.resourcesRestored, items);

  // Write the resource reset (and any Pact slot restore) alongside HP in the
  // dispatcher's character.update below. Route resources through
  // serializeResourcesState so all keys round-trip — prevents silent data loss.
  await tx.character.update({
    where: { id: characterId },
    data: {
      resources: serializeResourcesState(resources.state),
      ...(pact ? { spellcasting: pact.spellcasting } : {}),
    },
  });

  return { summary, eventData };
}

/**
 * Long-rest spell recovery: every caster's slots (including Warlock Pact) plus
 * Mystic Arcanum charges reset, and any active concentration ends.
 */
function resetLongRestSpellcasting(row: HpOpContext["row"]): {
  beforeSpellState: Record<string, unknown>;
  slotsRestored: number;
  spellcasting: Prisma.InputJsonValue;
} {
  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const beforeSpellState = cloneSpellStateForRest(spellState);
  const slotsRestored =
    Object.values(spellState.slotsUsed).reduce((s, n) => s + n, 0) +
    Object.values(spellState.arcanumUsed).reduce((s, n) => s + n, 0);
  spellState.slotsUsed = {};
  spellState.arcanumUsed = {};
  spellState.concentratingOn = null;
  return {
    beforeSpellState,
    slotsRestored,
    spellcasting: {
      slotsUsed: spellState.slotsUsed,
      arcanumUsed: spellState.arcanumUsed,
      spells: spellState.spells,
      concentratingOn: null,
    } as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Recharge limited-use consumables (#121): charged items (maxUses set) reset
 * to full. Lives in the combat domain (with the rest phases that trigger it)
 * rather than lib/inventory, avoiding an inventory↔combat import cycle.
 */
async function rechargeConsumables(
  tx: Prisma.TransactionClient,
  characterId: string,
): Promise<{
  consumablesRecharged: number;
  before: { inventoryItemId: string; usesRemaining: number | null }[];
  after: { inventoryItemId: string; usesRemaining: number | null }[];
}> {
  const chargedRows = await tx.inventoryConsumableDetail.findMany({
    where: { inventoryItem: { characterId }, maxUses: { not: null } },
    select: { inventoryItemId: true, usesRemaining: true, maxUses: true },
  });
  const before: { inventoryItemId: string; usesRemaining: number | null }[] = [];
  const after: { inventoryItemId: string; usesRemaining: number | null }[] = [];
  let consumablesRecharged = 0;
  for (const c of chargedRows) {
    if (c.usesRemaining !== c.maxUses) {
      before.push({ inventoryItemId: c.inventoryItemId, usesRemaining: c.usesRemaining });
      after.push({ inventoryItemId: c.inventoryItemId, usesRemaining: c.maxUses });
      await tx.inventoryConsumableDetail.update({
        where: { inventoryItemId: c.inventoryItemId },
        data: { usesRemaining: c.maxUses },
      });
      consumablesRecharged += 1;
    }
  }
  return { consumablesRecharged, before, after };
}

/**
 * A long rest removes exactly one level of exhaustion (SRD 5.2 / #1136).
 * Returns null (no write, no snapshot, no summary part) when the character has
 * no exhaustion, so undo only ever restores a level that was actually cleared.
 */
function recoverExhaustionOnLongRest(row: HpOpContext["row"]): {
  beforeConditionsState: ConditionsMutableState;
  afterConditionsState: ConditionsMutableState;
  conditions: Prisma.InputJsonValue;
  summaryPart: string;
} | null {
  const state = normalizeConditionsMutable(row.conditions);
  if (state.exhaustion <= 0) return null;
  const beforeConditionsState = { active: state.active.map((e) => ({ ...e })), exhaustion: state.exhaustion };
  state.exhaustion -= 1;
  const afterConditionsState = { active: state.active.map((e) => ({ ...e })), exhaustion: state.exhaustion };
  return {
    beforeConditionsState,
    afterConditionsState,
    conditions: serializeConditionsState(state),
    summaryPart: `Exhaustion −1 (now ${state.exhaustion})`,
  };
}

export async function applyLongRestOp(ctx: HpOpContext): Promise<HpOpResult> {
  const { tx, characterId, row, hp, hd, effMax } = ctx;
  const prevCurrent = hp.current;
  hp.current = effMax;
  hp.temp = 0;
  hp.deathSaves = { successes: 0, failures: 0 };
  // Recover hit dice equal to half your total, rounded up (SRD 5.2 Long Rest), min 1.
  const recovered = Math.max(1, Math.ceil(hd.total / 2));
  hd.spent = Math.max(0, hd.spent - recovered);

  const spells = resetLongRestSpellcasting(row);
  const resources = resetRestResources(row, "long");
  const afterResourceState = serializeResourcesState(resources.state);
  const exhaustion = recoverExhaustionOnLongRest(row);
  const items = await runItemRestResets(ctx, "long");
  const consumables = await rechargeConsumables(tx, characterId);

  const hpRestored = effMax - prevCurrent;
  const eventData: Record<string, unknown> = {
    recovered,
    hpRestored,
    slotsRestored: spells.slotsRestored,
    resourcesRestored: resources.resourcesRestored,
    itemSpellsRestored: items.itemSpellsRestored,
  };
  if (consumables.consumablesRecharged > 0) {
    eventData.consumablesRecharged = consumables.consumablesRecharged;
    eventData.consumableChargesBefore = consumables.before;
    eventData.consumableChargesAfter = consumables.after;
  }
  Object.assign(eventData, chargePoolEventData(items.chargePools));

  const parts: string[] = [];
  if (hpRestored > 0) parts.push(`+${hpRestored} HP`);
  else parts.push("HP already full");
  if (spells.slotsRestored > 0) parts.push(`${spells.slotsRestored} slot${spells.slotsRestored !== 1 ? "s" : ""} restored`);
  if (resources.resourcesRestored > 0) parts.push(`resources restored`);
  if (items.itemSpellsRestored > 0) parts.push(`item spells restored`);
  if (consumables.consumablesRecharged > 0) parts.push(`consumables recharged`);
  if (items.chargePools.recharged > 0) parts.push(`item charges recharged`);
  if (exhaustion) parts.push(exhaustion.summaryPart);
  const summary = `Long rest — ${parts.join(", ")}`;

  // Write spellcasting + resources (+ conditions when exhaustion recovered); the
  // dispatcher writes HP separately below.
  await tx.character.update({
    where: { id: characterId },
    data: {
      spellcasting: spells.spellcasting,
      resources: afterResourceState,
      ...(exhaustion ? { conditions: exhaustion.conditions } : {}),
    },
  });

  // Include spellcasting + resources in the before/after snapshot for undo.
  eventData.beforeSpellState = spells.beforeSpellState;
  eventData.beforeResourceState = resources.beforeResourceState;
  eventData.afterResourceState = afterResourceState;
  if (exhaustion) {
    eventData.beforeConditionsState = exhaustion.beforeConditionsState;
    eventData.afterConditionsState = exhaustion.afterConditionsState;
  }
  return { summary, eventData };
}
