import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import {
  activeResistedDamageTypes,
  clearBuffsForSourceInTx,
  clearBuffsForRestInTx,
  clearWhileActiveBuffsInTx,
  normalizeActiveEffectsMutable,
} from "./active-effects.js";
import { itemImmuneDamageTypes, itemResistedDamageTypes, type GrantItem } from "@/lib/inventory/capabilities.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { logEvent } from "@/lib/activity/events.js";
import { resetActivatedUsesForRestInTx } from "@/lib/inventory/item-recharge.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";
import {
  abilityModifier,
  advancementSlotsForLevel,
  concentrationSaveDC,
  deriveFeatBonuses,
  deriveFeatProficiencies,
  hitDieFace,
  multiclassPrerequisitesMet,
} from "@/lib/srd/srd.js";
import { rollDie } from "@/lib/core/dice.js";
import { deriveResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import {
  cloneResourceLists,
  normalizeResourcesMutable,
  serializeResourcesState,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import {
  castResourceRechargesOn,
  chargeTriggerRechargesOn,
  readCapability,
  type CapabilityColumns,
} from "@/lib/inventory/capabilities.js";

export class InvalidHitPointOperationError extends Error {}

// ---- Canonical JSON shapes (stored in hitPoints / hitDice columns) ----

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
  deathSaves: { successes: number; failures: number };
}

export interface HitDice {
  total: number;
  die: string; // e.g. "d10"
  spent: number;
}

// ---- Normalizers ----
// These are applied in serializeCharacter (lib/character/character-serialize.ts) so every
// GET response carries the new fields even for rows that predate the
// `deathSaves` / `spent` additions — no data migration needed.

export function normalizeHitPoints(json: Prisma.JsonValue): HitPoints {
  const hp = (json ?? {}) as Record<string, unknown>;
  const ds = (hp.deathSaves ?? {}) as Record<string, unknown>;
  return {
    current: Number(hp.current ?? 0),
    max: Number(hp.max ?? 1),
    temp: Number(hp.temp ?? 0),
    deathSaves: {
      successes: Math.min(3, Math.max(0, Number(ds.successes ?? 0))),
      failures: Math.min(3, Math.max(0, Number(ds.failures ?? 0))),
    },
  };
}

export function normalizeHitDice(json: Prisma.JsonValue): HitDice {
  const hd = (json ?? {}) as Record<string, unknown>;
  return {
    total: Number(hd.total ?? 1),
    die: String(hd.die ?? "d6"),
    spent: Number(hd.spent ?? 0),
  };
}

// ---- Pure helpers (no DB, fully unit-testable) ----

/**
 * Fixed average HP gain per level-up for a given hit die face count.
 * 5e PHB fixed values: d6→4, d8→5, d10→6, d12→7.
 */
export function fixedAverageForDie(faces: number): number {
  return Math.floor(faces / 2) + 1;
}

/**
 * HP gain from one level-up. Level-up floor is max(1, …) — a bad Con
 * cannot produce less than 1 HP per level.
 * For "roll" method, `roll` is the raw die value sent by the client (validated
 * by the caller to be in range 1..faces).
 */
export function levelUpHpGain(
  faces: number,
  conMod: number,
  method: "average" | "roll",
  roll?: number
): number {
  const dieValue = method === "average" ? fixedAverageForDie(faces) : (roll ?? faces);
  return Math.max(1, dieValue + conMod);
}

/**
 * HP healed from spending one hit die during a short rest.
 * Short-rest floor is max(0, …) — negative Con reduces a die's contribution
 * to 0, not negative. This differs from the level-up max(1, …) floor.
 */
export function hitDieHeal(roll: number, conMod: number): number {
  return Math.max(0, roll + conMod);
}

/**
 * Resolve an incoming damage instance against active resistances (#456) and
 * item-granted damage immunities (#529). When the (optional) damage type matches
 * an immunity the applied amount is zeroed; when it matches a resistance it is
 * halved (round down, 5e). Immunity wins over resistance. Both honor the player's
 * decline override (applyResistance=false → full damage). Returns the amount
 * applied plus whether it was halved and/or zeroed (for history/UI).
 */
export function resolveDamageAmount(
  rawAmount: number,
  damageType: string | undefined,
  resistedTypes: Set<string>,
  applyResistance: boolean,
  immuneTypes: Set<string> = new Set(),
): { applied: number; resisted: boolean; immune: boolean } {
  const typed = applyResistance && damageType !== undefined;
  if (typed && immuneTypes.has(damageType)) return { applied: 0, resisted: false, immune: true };
  if (typed && resistedTypes.has(damageType)) return { applied: Math.floor(rawAmount / 2), resisted: true, immune: false };
  return { applied: rawAmount, resisted: false, immune: false };
}

/**
 * Apply a d20 death save roll, returning the new deathSaves state and
 * updated current HP.
 *
 * - Nat 20 → regain 1 HP + full reset (conscious again).
 * - 3 successes → stable but still unconscious (reset, current stays 0).
 * - 3 failures → dead (leave failures at 3; no persisted "dead" flag — UI
 *   shows three filled failure pips as the signal).
 */
export function applyDeathSaveRoll(
  deathSaves: { successes: number; failures: number },
  current: number,
  roll: number
): { deathSaves: { successes: number; failures: number }; current: number } {
  if (roll === 20) {
    return { deathSaves: { successes: 0, failures: 0 }, current: 1 };
  }

  let { successes, failures } = deathSaves;
  if (roll === 1) {
    failures = Math.min(3, failures + 2);
  } else if (roll <= 9) {
    failures = Math.min(3, failures + 1);
  } else {
    // 10–19
    successes = Math.min(3, successes + 1);
  }

  // 3 successes → stable (still 0 HP / unconscious, not dead)
  if (successes >= 3) {
    return { deathSaves: { successes: 0, failures: 0 }, current };
  }

  return { deathSaves: { successes, failures }, current };
}

// ---- Operation types ----

/** HP damage: temp absorbs first, then current. Floors at 0. */
export interface DamageOperation {
  type: "damage";
  amount: number; // raw damage; must be > 0
  /** Optional 5e damage type (e.g. "slashing"); drives resistance auto-halving (#456). */
  damageType?: string;
  /**
   * Manual override for resistance auto-halving (#456). Omitted/true auto-halves
   * when a matching resistance is active; false declines (take the full amount).
   */
  applyResistance?: boolean;
  /**
   * Whether a triggered concentration CON save is auto-rolled server-side
   * (default) or deferred for the client to roll (issue #76). Treated as
   * auto when omitted or true; only `false` defers. The death/0-HP path
   * ends concentration with no save regardless of this flag.
   */
  autoRollConcentration?: boolean;
}

/** HP healing. If current was 0 (dying), resets death saves. */
export interface HealOperation {
  type: "heal";
  amount: number; // must be > 0
}

/** Set temporary HP. 5e rule: doesn't stack — takes the higher. */
export interface SetTempOperation {
  type: "setTemp";
  amount: number; // must be >= 0
}

/**
 * Short rest: spend hit dice to heal. `rolls` is an array of raw die values
 * (1..hitDieFace), one per die spent. Client rolls via dice.ts and sends the
 * raw values; server validates range and applies the rules math.
 */
export interface ShortRestOperation {
  type: "shortRest";
  rolls: number[];
}

/** Long rest: restore full HP, clear temp, recover half spent hit dice (min 1). */
export interface LongRestOperation {
  type: "longRest";
}

/**
 * Which class a level-up advances (issue #124):
 * - omitted → position-0 self-heal, exactly as before multiclassing (BC).
 * - existing → increment an existing CharacterClassEntry by classEntryId.
 * - new → add a second class (multiclass); enforces 5e ability prerequisites.
 */
export type LevelUpTarget =
  | { kind: "existing"; classEntryId: string }
  | { kind: "new"; classId: string };

/**
 * Level-up: adds 1 to hitDice.total, increases max and current HP.
 * Requires a pending level (derivedLevel > hitDice.total).
 * For "roll" method the client rolls via dice.ts and sends the raw die face;
 * for "average" the server computes the fixed average.
 * `target` chooses which class advances; HP/hit-dice use THAT class's hit die.
 */
export interface LevelUpOperation {
  type: "levelUp";
  method: "average" | "roll";
  roll?: number; // raw die value (required when method === "roll")
  target?: LevelUpTarget;
}

/**
 * Roll a death save (d20). Only valid when current === 0.
 * Client rolls via dice.ts and sends the raw value.
 */
export interface DeathSaveOperation {
  type: "deathSave";
  roll: number; // 1..20
}

/** Stabilize the character (Medicine check success, etc.). Only valid when current === 0. */
export interface StabilizeOperation {
  type: "stabilize";
}

/**
 * Resolve a deferred concentration CON save with a client-rolled d20 (issue #76).
 * Emitted as a follow-up to a `damage` op that ran with `autoRollConcentration:
 * false` and returned a `pending` check. The server recomputes the DC from
 * `damage` (never trusts a client DC) and the save bonus from the live character;
 * `roll` is the only client-supplied value (validated 1..20, like deathSave).
 * No-op if the character is no longer concentrating on `entryId`.
 */
export interface ConcentrationSaveOperation {
  type: "concentrationSave";
  entryId: string;
  roll: number; // 1..20
  damage: number; // the damage instance this save responds to (> 0)
}

export type HitPointOperation =
  | DamageOperation
  | HealOperation
  | SetTempOperation
  | ShortRestOperation
  | LongRestOperation
  | LevelUpOperation
  | DeathSaveOperation
  | StabilizeOperation
  | ConcentrationSaveOperation;

// ---- Concentration-on-damage (issue #41) ----

/**
 * Outcome of a concentration check triggered by a damage instance. Returned
 * (when non-null) so the route can surface the auto-rolled save to the player.
 * `held: false` with `reason: "death"` means concentration was dropped without
 * a save because the character hit 0 HP (or died).
 */
export interface ConcentrationCheckResult {
  /**
   * "resolved" — the save was rolled (or skipped via the death path); the
   * outcome in `held` is final. "pending" — a manual save is deferred to the
   * client (issue #76): `dc`/`saveBonus` are populated, `held`/`roll`/`total`
   * are null, and the client must follow up with a `concentrationSave` op.
   */
  status: "resolved" | "pending";
  /** The concentrating SpellEntry id — needed for the follow-up resolve op. */
  entryId: string;
  spellName: string;
  reason: "damage" | "death";
  /** null while pending (not yet rolled). */
  held: boolean | null;
  /** Present only for an actual save (reason "damage"); null on the 0-HP path or while pending. */
  roll: number | null;
  saveBonus: number | null;
  total: number | null;
  dc: number | null;
  damage: number;
}

/**
 * Compute the Constitution-save bonus and DC for a concentration check from a
 * character row and one damage instance. Save bonus = CON modifier + proficiency
 * bonus IF proficient in CON saves (class grant or feat grant). DC = max(10,
 * floor(damage / 2)). Shared by the auto path and the deferred manual-resolve
 * path so the 5e math lives in exactly one place.
 */
function computeConcentrationSave(
  row: {
    abilityScores: Prisma.JsonValue;
    experiencePoints: number;
    savingThrowProficiencies: string[];
    resources: Prisma.JsonValue;
    classEntries: { name: string }[];
  },
  damage: number,
): { saveBonus: number; dc: number } {
  const abilityScores = row.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const advState = normalizeResourcesMutable(row.resources);
  const featSlotCap = advancementSlotsForLevel(row.classEntries[0]?.name ?? "", level);
  const featProf = deriveFeatProficiencies(advState.advancements.slice(0, featSlotCap));
  const proficientInCon =
    row.savingThrowProficiencies.includes("constitution") ||
    featProf.savingThrows.has("constitution");
  const saveBonus = conMod + (proficientInCon ? profBonus : 0);
  return { saveBonus, dc: concentrationSaveDC(damage) };
}

/**
 * If the character is concentrating, resolve the 5e "concentration on damage"
 * rule for one instance of damage and, on a drop, clear `concentratingOn` and
 * log a `concentrationDropped` event.
 *
 * - At 0 HP (or already dead): concentration ends UNCONDITIONALLY, no save —
 *   reason "death". The 0-HP path wins if it also would have triggered a save.
 *   Runs regardless of `autoRoll`.
 * - Otherwise, when `autoRoll` is true: roll a Constitution saving throw
 *   server-side. DC = max(10, floor(damage / 2)). On a failed save (total < DC)
 *   concentration ends — reason "damage". On a success, nothing is logged.
 * - Otherwise, when `autoRoll` is false (issue #76): compute the DC + save bonus
 *   but DO NOT roll, mutate, or log. Return a `status: "pending"` result so the
 *   client can roll the save and follow up with a `concentrationSave` op.
 *
 * NOTE (deferred, issue #41 follow-up): concentration should ALSO end when the
 * incapacitated / stunned / paralyzed / unconscious CONDITIONS are applied. That
 * lives in the conditions feature (lib + conditions transaction path) and is
 * intentionally out of scope here. The 0-HP path below covers the common case
 * (dropping to 0 HP makes a character unconscious), but a directly-applied
 * condition with the character still above 0 HP will not yet drop concentration.
 *
 * The event is logged under category "spellcasting" (not "hitPoints") so the
 * activity revert handler restores the full spellcasting JSON from `before` —
 * sharing the batchId with the damage event means LIFO undo reverses both.
 *
 * Returns the check result for the route to surface, or null when the character
 * was not concentrating.
 */
async function applyConcentrationCheckInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  damage: number,
  newCurrentHp: number,
  batchId: string,
  sessionId: string | null,
  autoRoll = true,
): Promise<ConcentrationCheckResult | null> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      abilityScores: true,
      experiencePoints: true,
      savingThrowProficiencies: true,
      resources: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true },
      },
    },
  });
  if (!row) return null;

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const prior = state.concentratingOn;
  if (!prior) return null;

  const beforeSpellcasting = {
    slotsUsed: { ...state.slotsUsed },
    arcanumUsed: { ...state.arcanumUsed },
    spells: state.spells.map((s) => ({ ...s })),
    concentratingOn: { ...prior },
  };

  // Decide whether the save is even rolled.
  const droppedByDeath = newCurrentHp <= 0;
  let result: ConcentrationCheckResult;

  if (droppedByDeath) {
    result = {
      status: "resolved",
      entryId: prior.entryId,
      spellName: prior.spellName,
      reason: "death",
      held: false,
      roll: null,
      saveBonus: null,
      total: null,
      dc: null,
      damage,
    };
  } else {
    const { saveBonus, dc } = computeConcentrationSave(row, damage);

    if (!autoRoll) {
      // Manual path (issue #76): defer the roll to the client. Compute the DC
      // and bonus for the prompt, but leave concentration untouched — the
      // follow-up `concentrationSave` op resolves it.
      return {
        status: "pending",
        entryId: prior.entryId,
        spellName: prior.spellName,
        reason: "damage",
        held: null,
        roll: null,
        saveBonus,
        total: null,
        dc,
        damage,
      };
    }

    const roll = rollDie(20);
    const total = roll + saveBonus;
    const held = total >= dc;

    result = {
      status: "resolved",
      entryId: prior.entryId,
      spellName: prior.spellName,
      reason: "damage",
      held,
      roll,
      saveBonus,
      total,
      dc,
      damage,
    };

    if (held) {
      // Successful save — concentration holds, nothing to persist or log.
      return result;
    }
  }

  // Drop concentration (failed save, or 0-HP/death path).
  state.concentratingOn = null;
  await tx.character.update({
    where: { id: characterId },
    data: {
      spellcasting: {
        slotsUsed: state.slotsUsed,
        arcanumUsed: state.arcanumUsed,
        spells: state.spells,
        concentratingOn: null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const afterSpellcasting = {
    slotsUsed: { ...state.slotsUsed },
    arcanumUsed: { ...state.arcanumUsed },
    spells: state.spells.map((s) => ({ ...s })),
    concentratingOn: null,
  };

  const summary = droppedByDeath
    ? `Concentration on ${prior.spellName} dropped (dropped to 0 HP)`
    : `Concentration on ${prior.spellName} lost (CON save ${String(result.total)} vs DC ${String(result.dc)})`;

  await logEvent(tx, {
    characterId,
    category: "spellcasting",
    type: "concentrationDropped",
    summary,
    before: { spellcasting: beforeSpellcasting },
    after: { spellcasting: afterSpellcasting },
    data: {
      droppedEntryId: prior.entryId,
      droppedSpellName: prior.spellName,
      reason: result.reason,
      roll: result.roll,
      saveBonus: result.saveBonus,
      total: result.total,
      dc: result.dc,
      damage: result.damage,
      held: result.held,
    },
    batchId,
    sessionId,
  });

  // Ending concentration drops any buffs it was maintaining (#438).
  await clearBuffsForSourceInTx(tx, characterId, prior.entryId, batchId, sessionId, result.reason);

  return result;
}

/**
 * Resolve a deferred concentration CON save with a client-rolled d20 (issue #76),
 * the follow-up to a `damage` op that ran with `autoRollConcentration: false`.
 *
 * The DC is recomputed from `damage` and the save bonus from the live character —
 * the client's only trusted input is `roll` (validated 1..20 at the route). If the
 * character is no longer concentrating on `entryId` (already dropped, a second
 * damage resolved first, or a duplicate submit), this is a no-op and returns null.
 *
 * NOTE: unlike the auto path — which shares the damage op's batchId so a single
 * undo reverses HP + concentration together — a manual save arrives in its own
 * request, so this logs under a fresh batchId and is undone as a separate LIFO
 * entry. The spellcasting revert handler restores `concentratingOn` on undo.
 */
async function applyConcentrationSaveInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  entryId: string,
  roll: number,
  damage: number,
  batchId: string,
  sessionId: string | null,
): Promise<ConcentrationCheckResult | null> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      abilityScores: true,
      experiencePoints: true,
      savingThrowProficiencies: true,
      resources: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true },
      },
    },
  });
  if (!row) return null;

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const prior = state.concentratingOn;
  // Stale no-op: not concentrating, or concentrating on a different spell now.
  if (!prior || prior.entryId !== entryId) return null;

  const { saveBonus, dc } = computeConcentrationSave(row, damage);
  const total = roll + saveBonus;
  const held = total >= dc;

  const result: ConcentrationCheckResult = {
    status: "resolved",
    entryId: prior.entryId,
    spellName: prior.spellName,
    reason: "damage",
    held,
    roll,
    saveBonus,
    total,
    dc,
    damage,
  };

  if (held) {
    // Successful save — concentration holds, nothing to persist or log.
    return result;
  }

  const beforeSpellcasting = {
    slotsUsed: { ...state.slotsUsed },
    arcanumUsed: { ...state.arcanumUsed },
    spells: state.spells.map((s) => ({ ...s })),
    concentratingOn: { ...prior },
  };

  state.concentratingOn = null;
  await tx.character.update({
    where: { id: characterId },
    data: {
      spellcasting: {
        slotsUsed: state.slotsUsed,
        arcanumUsed: state.arcanumUsed,
        spells: state.spells,
        concentratingOn: null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const afterSpellcasting = {
    slotsUsed: { ...state.slotsUsed },
    arcanumUsed: { ...state.arcanumUsed },
    spells: state.spells.map((s) => ({ ...s })),
    concentratingOn: null,
  };

  await logEvent(tx, {
    characterId,
    category: "spellcasting",
    type: "concentrationDropped",
    summary: `Concentration on ${prior.spellName} lost (CON save ${String(total)} vs DC ${String(dc)})`,
    before: { spellcasting: beforeSpellcasting },
    after: { spellcasting: afterSpellcasting },
    data: {
      droppedEntryId: prior.entryId,
      droppedSpellName: prior.spellName,
      reason: "damage",
      roll,
      saveBonus,
      total,
      dc,
      damage,
      held,
    },
    batchId,
    sessionId,
  });

  // Ending concentration drops any buffs it was maintaining (#438).
  await clearBuffsForSourceInTx(tx, characterId, prior.entryId, batchId, sessionId, "damage");

  return result;
}

// ---- Per-op appliers ----
// Module-private helpers extracted from the applyHitPointOperations switch.
// Each mutates ctx.hp/ctx.hd in place, does any side-table writes it owns,
// throws InvalidHitPointOperationError on validation failure, and returns the
// summary/eventData for the dispatcher to log. Helpers never call logEvent.

interface HpOpContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  row: {
    hitPoints: Prisma.JsonValue;
    hitDice: Prisma.JsonValue;
    abilityScores: Prisma.JsonValue;
    experiencePoints: number;
    spellcasting: Prisma.JsonValue;
    resources: Prisma.JsonValue;
    activeEffects: Prisma.JsonValue;
    classEntries: ClassEntryRow[];
    // Union of three shapes over the same rows: castSpell rest-reset (#528: capability
    // id + used), grant derivation (#529: GrantItem name/requiresAttunement), and the
    // paper-doll placement (#565: equippedSlot replaces the derived `equipped`).
    inventoryItems?: (Omit<GrantItem, "capabilities" | "equipped"> & {
      id: string;
      capabilities: (CapabilityColumns & { id: string; used?: number | null })[];
      equippedSlot: string | null;
    })[];
  };
  hp: HitPoints;
  hd: HitDice;
  conMod: number;
  faces: number;
  effMax: number;
  primaryEntry: ClassEntryRow | undefined;
  beforeClassLevel: number | null;
}

interface ClassEntryRow {
  id: string;
  level: number;
  name: string;
  subclass: string | null;
  classId: string | null;
  position: number;
  class: { hitDie: string } | null;
}

interface HpOpResult {
  summary: string;
  eventData: Record<string, unknown>;
  damageForConcentration?: number;
}

function applyDamageOp(ctx: HpOpContext, op: DamageOperation): HpOpResult {
  const { hp, row } = ctx;
  if (op.amount <= 0) {
    throw new InvalidHitPointOperationError("damage amount must be positive");
  }
  // Auto-halve against active resistances (#456) / zero against item immunities
  // (#529) unless the player declined: cast-buff resistances (Rage) unioned with
  // item-granted resistances; item immunities zero the matching type.
  const resisted = activeResistedDamageTypes(normalizeActiveEffectsMutable(row.activeEffects));
  // Map the paper-doll placement to the boolean "worn" flag the grant helpers expect (#565).
  const itemsForGrants = (row.inventoryItems ?? []).map((i) => ({ ...i, equipped: i.equippedSlot != null }));
  for (const t of itemResistedDamageTypes(itemsForGrants)) resisted.add(t);
  const immune = itemImmuneDamageTypes(itemsForGrants);
  const { applied, resisted: wasResisted, immune: wasImmune } = resolveDamageAmount(
    op.amount,
    op.damageType,
    resisted,
    op.applyResistance !== false,
    immune,
  );

  const beforeCurrent = hp.current;
  // Temp HP absorbs first, then current. Both floor at 0.
  const absorbed = Math.min(hp.temp, applied);
  hp.temp -= absorbed;
  hp.current = Math.max(0, hp.current - (applied - absorbed));

  const typeLabel = op.damageType ? ` ${op.damageType}` : "";
  const resistNote = wasImmune ? ` (immune, from ${op.amount})` : wasResisted ? ` (resisted from ${op.amount})` : "";
  // The 5e concentration save uses the damage actually taken (post-resistance).
  return {
    summary: `Took ${applied}${typeLabel} damage${resistNote} (${beforeCurrent} → ${hp.current} HP)`,
    eventData: {
      amount: applied,
      rawAmount: op.amount,
      damageType: op.damageType ?? null,
      resisted: wasResisted,
      immune: wasImmune,
    },
    damageForConcentration: applied,
  };
}

function applyHealOp(ctx: HpOpContext, op: HealOperation): HpOpResult {
  const { hp, effMax } = ctx;
  if (op.amount <= 0) {
    throw new InvalidHitPointOperationError("heal amount must be positive");
  }
  const beforeCurrent = hp.current;
  // Regaining any HP while at 0 (dying) wakes the character and clears death saves.
  if (hp.current === 0) {
    hp.deathSaves = { successes: 0, failures: 0 };
  }
  hp.current = Math.min(effMax, hp.current + op.amount);
  return {
    summary: `Healed ${op.amount} HP (${beforeCurrent} → ${hp.current} HP)`,
    eventData: { amount: op.amount },
  };
}

function applySetTempOp(ctx: HpOpContext, op: SetTempOperation): HpOpResult {
  const { hp } = ctx;
  if (op.amount < 0) {
    throw new InvalidHitPointOperationError("setTemp amount must be non-negative");
  }
  // 5e: temp HP doesn't stack — take the higher value.
  hp.temp = Math.max(hp.temp, op.amount);
  return {
    summary: `Set temporary HP to ${op.amount}`,
    eventData: { amount: op.amount },
  };
}

function applyDeathSaveOp(ctx: HpOpContext, op: DeathSaveOperation): HpOpResult {
  const { hp } = ctx;
  if (hp.current !== 0) {
    throw new InvalidHitPointOperationError(
      "Can only roll a death save when at 0 HP (unconscious/dying)"
    );
  }
  if (op.roll < 1 || op.roll > 20) {
    throw new InvalidHitPointOperationError(
      "Death save roll must be between 1 and 20"
    );
  }
  const rollResult = applyDeathSaveRoll(hp.deathSaves, hp.current, op.roll);
  hp.deathSaves = rollResult.deathSaves;
  hp.current = rollResult.current;
  const ds = hp.deathSaves;
  const summary = op.roll === 20
    ? `Death save: natural 20 — regained consciousness`
    : `Death save: rolled ${op.roll} (${ds.successes} success${ds.successes !== 1 ? "es" : ""}, ${ds.failures} failure${ds.failures !== 1 ? "s" : ""})`;
  return { summary, eventData: { roll: op.roll } };
}

function applyStabilizeOp(ctx: HpOpContext): HpOpResult {
  const { hp } = ctx;
  if (hp.current !== 0) {
    throw new InvalidHitPointOperationError(
      "Can only stabilize when at 0 HP (unconscious/dying)"
    );
  }
  hp.deathSaves = { successes: 0, failures: 0 };
  return { summary: "Stabilized", eventData: {} };
}

// ---- Level-up helpers ----
// applyLevelUpOp dispatches on the op's target: a NEW class (multiclass), an
// EXISTING class entry, or the no-target position-0 self-heal. All three share
// the roll validation + HP/hit-dice bump and the same eventData shape, which
// stores enough to exactly reverse the level-up (Phase 4 undo, and the
// auto-reverse in experience-ops.ts when XP is lowered).

/**
 * Validate the client roll against the CHOSEN class's die (may differ from
 * the position-0 die stored in hd.die once multiclassing is in play).
 */
function requireLevelUpRoll(op: LevelUpOperation, dieFaces: number): void {
  if (op.method === "roll" && (op.roll === undefined || op.roll < 1 || op.roll > dieFaces)) {
    throw new InvalidHitPointOperationError(
      `Roll for level-up must be between 1 and ${dieFaces} (got ${String(op.roll)})`
    );
  }
}

/** Apply the shared HP/hit-dice bump for a given die face count; returns the gain. */
function bumpHpForLevelUp(ctx: HpOpContext, op: LevelUpOperation, dieFaces: number): number {
  const gain = levelUpHpGain(dieFaces, ctx.conMod, op.method, op.roll);
  ctx.hd.total += 1;
  ctx.hp.max += gain;
  ctx.hp.current += gain;
  return gain;
}

/** The reversal-grade eventData every level-up variant shares. */
function levelUpEventData(
  op: LevelUpOperation,
  conMod: number,
  faces: number,
  hpGain: number,
  entry: { primaryEntryId: string | null; prevEntryLevel: number | null; newEntryLevel: number },
): Record<string, unknown> {
  return {
    method: op.method,
    roll: op.roll ?? null,
    conMod,
    faces,
    hpGain,
    ...entry,
  };
}

/** Level up into a NEW class (multiclass): prereq-gated, creates a level-1 entry. */
async function applyNewClassLevelUp(
  ctx: HpOpContext,
  op: LevelUpOperation,
  target: { classId: string },
): Promise<HpOpResult> {
  const { tx, characterId, row, conMod } = ctx;
  const catalog = await tx.characterClass.findUnique({
    where: { id: target.classId },
    select: { id: true, name: true, hitDie: true },
  });
  if (!catalog) {
    throw new InvalidHitPointOperationError(`Class not found: ${target.classId}`);
  }
  if (row.classEntries.some((e) => e.classId === catalog.id)) {
    throw new InvalidHitPointOperationError(
      `Character already has levels in ${catalog.name} — use an existing-class target`
    );
  }
  const abilityScores = row.abilityScores as Record<string, number>;
  const prereq = multiclassPrerequisitesMet(catalog.name, abilityScores);
  if (!prereq.met) {
    throw new InvalidHitPointOperationError(
      `Cannot multiclass into ${catalog.name}: requires ${prereq.description}`
    );
  }
  const newFaces = hitDieFace(catalog.hitDie);
  requireLevelUpRoll(op, newFaces);
  const gain = bumpHpForLevelUp(ctx, op, newFaces);
  const position = row.classEntries.reduce((max, e) => Math.max(max, e.position), -1) + 1;
  const created = await tx.characterClassEntry.create({
    data: { characterId, classId: catalog.id, name: catalog.name, level: 1, position },
  });
  return {
    summary: `Multiclassed into ${catalog.name} (level 1, +${gain} HP)`,
    eventData: {
      ...levelUpEventData(op, conMod, newFaces, gain, {
        primaryEntryId: null,
        prevEntryLevel: null,
        newEntryLevel: 1,
      }),
      createdClassEntryId: created.id,
    },
  };
}

/** Level up a CHOSEN existing class entry, rolling that entry's own die. */
async function applyExistingClassLevelUp(
  ctx: HpOpContext,
  op: LevelUpOperation,
  target: { classEntryId: string },
): Promise<HpOpResult> {
  const { tx, row, conMod, faces } = ctx;
  const entry = row.classEntries.find((e) => e.id === target.classEntryId);
  if (!entry) {
    throw new InvalidHitPointOperationError(`Class entry not found: ${target.classEntryId}`);
  }
  const entryFaces = entry.class ? hitDieFace(entry.class.hitDie) : faces;
  requireLevelUpRoll(op, entryFaces);
  const gain = bumpHpForLevelUp(ctx, op, entryFaces);
  const newEntryLevel = entry.level + 1;
  await tx.characterClassEntry.update({
    where: { id: entry.id },
    data: { level: newEntryLevel },
  });
  return {
    summary: `Leveled up ${entry.name} to ${newEntryLevel} (+${gain} HP)`,
    eventData: levelUpEventData(op, conMod, entryFaces, gain, {
      primaryEntryId: entry.id,
      prevEntryLevel: entry.level,
      newEntryLevel,
    }),
  };
}

/**
 * No target — position-0 self-heal (backward-compatible path). Only valid for
 * single-class characters. A multiclass character has no unambiguous
 * position-0 to self-heal: this path would set that entry's level to
 * `hd.total` (the *total* character level), inflating it (#124). Callers with
 * more than one entry must pass an explicit target instead.
 */
async function applySelfHealLevelUp(ctx: HpOpContext, op: LevelUpOperation): Promise<HpOpResult> {
  const { tx, row, hd, conMod, faces, primaryEntry, beforeClassLevel } = ctx;
  if (row.classEntries.length > 1) {
    throw new InvalidHitPointOperationError(
      "Multiclass character requires an explicit level-up target (existing or new class)"
    );
  }
  requireLevelUpRoll(op, faces);
  const gain = bumpHpForLevelUp(ctx, op, faces);

  // Repair the position-0 class entry's `level` to match the newly-applied
  // total. The seed defaults all entries to level 1 even for level-7 chars;
  // this self-heals that on the first real level-up.
  if (primaryEntry) {
    await tx.characterClassEntry.update({
      where: { id: primaryEntry.id },
      data: { level: hd.total },
    });
  }

  return {
    summary: `Leveled up to ${hd.total} (+${gain} HP)`,
    eventData: levelUpEventData(op, conMod, faces, gain, {
      primaryEntryId: primaryEntry?.id ?? null,
      prevEntryLevel: beforeClassLevel,
      newEntryLevel: hd.total,
    }),
  };
}

async function applyLevelUpOp(ctx: HpOpContext, op: LevelUpOperation): Promise<HpOpResult> {
  const { hd, row } = ctx;
  const derivedLevel = levelForExperience(row.experiencePoints);
  if (hd.total >= derivedLevel) {
    throw new InvalidHitPointOperationError(
      `No pending level-up: already at level ${hd.total} (XP derives level ${derivedLevel})`
    );
  }
  const target = op.target;
  if (target?.kind === "new") return applyNewClassLevelUp(ctx, op, target);
  if (target?.kind === "existing") return applyExistingClassLevelUp(ctx, op, target);
  return applySelfHealLevelUp(ctx, op);
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
    // #565: `equipped` is derived from equippedSlot (no persisted boolean).
    if (item.equippedSlot == null && !item.attuned) continue;
    for (const col of item.capabilities) {
      const cap = readCapability(col);
      if (cap.kind !== "castSpell") continue;
      if (!castResourceRechargesOn(cap.resource, rest)) continue;
      if ((col.used ?? 0) > 0) {
        restored += col.used ?? 0;
        ids.push(col.id);
      }
    }
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
      const cap = readCapability(col);
      if (cap.kind !== "charges") continue;
      const used = col.used ?? 0;
      if (used <= 0) continue;
      if (!chargeTriggerRechargesOn(cap.rechargeTrigger, rest)) continue;
      let regained: number;
      if (cap.rechargeDice) {
        regained = cap.rechargeBonus ?? 0;
        for (let i = 0; i < cap.rechargeDice.count; i++) regained += rollDie(cap.rechargeDice.faces);
      } else if (cap.rechargeBonus) {
        regained = cap.rechargeBonus; // fixed amount ("regains 1 charge daily at dawn")
      } else {
        regained = used; // no formula = full refill
      }
      const nextUsed = Math.max(0, used - regained);
      if (nextUsed === used) continue;
      before.push({ capabilityId: col.id, itemName: item.name, used });
      after.push({ capabilityId: col.id, itemName: item.name, used: nextUsed });
      await ctx.tx.inventoryCapability.update({ where: { id: col.id }, data: { used: nextUsed } });
      recharged += used - nextUsed;
    }
  }
  return { recharged, before, after };
}

// ---- Rest phase helpers ----
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

/** Derive the primary class entry's resource pools (recharge schedule included). */
function deriveRestPools(row: HpOpContext["row"]): DerivedClassInfo | null {
  const level = levelForExperience(row.experiencePoints);
  const classEntry = row.classEntries[0];
  return deriveResources(
    classEntry?.name ?? "",
    classEntry?.subclass ?? undefined,
    level,
    row.abilityScores as Record<string, number>,
    proficiencyBonusForLevel(level),
  );
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
): { state: ResourcesMutableState; beforeResourceState: Record<string, unknown>; resourcesRestored: number } {
  const derivedRes = deriveRestPools(row);
  const state = normalizeResourcesMutable(row.resources);
  const beforeResourceState = { ...cloneResourceLists(state), fightingStyle: state.fightingStyle };
  let resourcesRestored = 0;
  for (const pool of derivedRes?.resources ?? []) {
    if (poolRechargesOn(pool.recharge, rest)) {
      resourcesRestored += state.used[pool.key] ?? 0;
      state.used[pool.key] = 0;
    }
  }
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
 * Warlock Pact Magic slots recharge on a short rest. A pure Warlock's only
 * spell slots are Pact slots, so clearing slotsUsed is safe. Mystic Arcanum is
 * long-rest only and concentration survives a short rest — both preserved.
 * Returns null for non-Warlocks (no spellcasting write, no snapshot).
 */
function restoreWarlockPactSlots(row: HpOpContext["row"]): {
  beforeSpellState: Record<string, unknown>;
  slotsRestored: number;
  spellcasting: Prisma.InputJsonValue;
} | null {
  const className = row.classEntries[0]?.name ?? "";
  if (className.toLowerCase() !== "warlock") return null;
  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const beforeSpellState = cloneSpellStateForRest(spellState);
  const slotsRestored = Object.values(spellState.slotsUsed).reduce((s, n) => s + n, 0);
  spellState.slotsUsed = {};
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

async function applyShortRestOp(ctx: HpOpContext, op: ShortRestOperation): Promise<HpOpResult> {
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
 * to full. Lives here rather than in lib/inventory/inventory.ts to avoid an
 * import cycle (inventory already imports this module).
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

async function applyLongRestOp(ctx: HpOpContext): Promise<HpOpResult> {
  const { tx, characterId, row, hp, hd, effMax } = ctx;
  const prevCurrent = hp.current;
  hp.current = effMax;
  hp.temp = 0;
  hp.deathSaves = { successes: 0, failures: 0 };
  // Recover hit dice equal to half your total (round down, min 1).
  const recovered = Math.max(1, Math.floor(hd.total / 2));
  hd.spent = Math.max(0, hd.spent - recovered);

  const spells = resetLongRestSpellcasting(row);
  const resources = resetRestResources(row, "long");
  const afterResourceState = serializeResourcesState(resources.state);
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
  const summary = `Long rest — ${parts.join(", ")}`;

  // Write spellcasting + resources; the dispatcher writes HP separately below.
  await tx.character.update({
    where: { id: characterId },
    data: { spellcasting: spells.spellcasting, resources: afterResourceState },
  });

  // Include spellcasting + resources in the before/after snapshot for undo.
  eventData.beforeSpellState = spells.beforeSpellState;
  eventData.beforeResourceState = resources.beforeResourceState;
  eventData.afterResourceState = afterResourceState;
  return { summary, eventData };
}

// ---- Per-op phase helpers ----
// The applyHitPointOperations loop runs each op through five ordered phases:
// context build → dispatch → snapshot assembly → main-event emit → follow-on
// events. Each phase is a named helper below so the loop reads linearly; the
// phase ORDER is load-bearing (the main hitPoints event must land before any
// buff-clear / concentration follow-ups so the timeline and LIFO undo stay
// consistent).

/** Every HP op except the manual concentration save, which the loop resolves on its own. */
type HpStateOperation = Exclude<HitPointOperation, ConcentrationSaveOperation>;

/**
 * Phase 1: read the character row and assemble the per-op context.
 * State is re-read from the DB for every op so a batch of N levelUp ops
 * applies sequentially (each sees the previous op's writes).
 */
async function buildHpOpContext(
  tx: Prisma.TransactionClient,
  characterId: string,
): Promise<HpOpContext> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      hitPoints: true,
      hitDice: true,
      abilityScores: true,
      experiencePoints: true,
      spellcasting: true,
      resources: true,
      activeEffects: true,
      // Selected fields feed two seams: id + capabilities (with used) for the
      // castSpell rest reset (#528), and name/requiresAttunement + capabilities
      // for item-granted resistances (#529, feeding the #456 halve flow below).
      inventoryItems: {
        select: {
          id: true,
          name: true,
          equippedSlot: true,
          attuned: true,
          requiresAttunement: true,
          capabilities: true,
        },
      },
      classEntries: {
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          level: true,
          name: true,
          subclass: true,
          classId: true,
          position: true,
          class: { select: { hitDie: true } },
        },
      },
    },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const abilityScores = row.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const faces = hitDieFace(hd.die);

  const primaryEntry = row.classEntries[0];

  // Compute the effective HP maximum including feat improvements (e.g. Tough).
  // This is a read-time overlay — hp.max itself stays the feat-free base so
  // the value written back to the DB never includes the feat bonus.
  // Use the in-cap advancements slice so over-cap feats are automatically excluded.
  const advStateForFeat = normalizeResourcesMutable(row.resources);
  const featSlotCap = advancementSlotsForLevel(
    primaryEntry?.name ?? "",
    levelForExperience(row.experiencePoints),
  );
  const featBonus = deriveFeatBonuses(advStateForFeat.advancements.slice(0, featSlotCap), hd.total);
  // effMax is used for all clamp/ceiling operations instead of hp.max.
  // hp.max is the stored (feat-free) base and is what gets persisted.
  const effMax = hp.max + featBonus.maxHp;

  return {
    tx,
    characterId,
    row,
    hp,
    hd,
    conMod,
    faces,
    effMax,
    primaryEntry,
    beforeClassLevel: primaryEntry?.level ?? null,
  };
}

/**
 * Phase 2: dispatch the op to its applier. Appliers mutate ctx.hp/ctx.hd in
 * place and return the summary/eventData for the loop to log — they never
 * call logEvent themselves (the loop is the sole emitter of the main event).
 */
async function dispatchHpOp(ctx: HpOpContext, op: HpStateOperation): Promise<HpOpResult> {
  switch (op.type) {
    case "damage":
      return applyDamageOp(ctx, op);

    case "heal":
      return applyHealOp(ctx, op);

    case "setTemp":
      return applySetTempOp(ctx, op);

    case "shortRest":
      return applyShortRestOp(ctx, op);

    case "longRest":
      return applyLongRestOp(ctx);

    case "levelUp":
      return applyLevelUpOp(ctx, op);

    case "deathSave":
      return applyDeathSaveOp(ctx, op);

    case "stabilize":
      return applyStabilizeOp(ctx);

    default: {
      const _exhaustive: never = op;
      throw new InvalidHitPointOperationError(`Unknown op type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

/** The mutable pair every snapshot lifter below appends to. */
interface HpOpSnapshots {
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
}

/**
 * levelUp: capture the class-entry level diff from the op result — it points
 * at the CHOSEN entry (or is null for a new-class add), not always position-0.
 */
function liftLevelUpSnapshot(snaps: HpOpSnapshots, eventData: Record<string, unknown>): void {
  snaps.beforeState.classEntryLevel = (eventData.prevEntryLevel as number | null) ?? null;
  snaps.afterState.classEntryLevel = (eventData.newEntryLevel as number | null) ?? null;
}

/**
 * longRest: spellcasting (so undo re-expends the slots), resources, and the
 * consumable recharge (#121) snapshots. The after-spellcasting reflects the
 * cleared state, preserving the known-spell list.
 */
function liftLongRestSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  const beforeSpell = data.beforeSpellState as Record<string, unknown>;
  snaps.beforeState.spellcasting = beforeSpell;
  snaps.afterState.spellcasting = { slotsUsed: {}, arcanumUsed: {}, spells: beforeSpell?.spells ?? [], concentratingOn: null };
  delete data.beforeSpellState; // don't duplicate in eventData
  if (data.beforeResourceState !== undefined) {
    snaps.beforeState.resources = data.beforeResourceState;
    snaps.afterState.resources = data.afterResourceState ?? data.beforeResourceState;
    delete data.beforeResourceState;
    delete data.afterResourceState;
  }
  if (data.consumableChargesBefore !== undefined) {
    snaps.beforeState.consumableCharges = data.consumableChargesBefore;
    snaps.afterState.consumableCharges = data.consumableChargesAfter ?? data.consumableChargesBefore;
    delete data.consumableChargesBefore;
    delete data.consumableChargesAfter;
  }
}

/**
 * shortRest: resources land in `before` ONLY (there is deliberately no
 * after.resources key — undo restores from before), plus the Warlock Pact
 * restore when present; a short rest preserves arcanum and concentration.
 */
function liftShortRestSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  if (data.beforeResourceState !== undefined) {
    snaps.beforeState.resources = data.beforeResourceState;
    delete data.beforeResourceState;
  }
  if (data.beforeSpellState !== undefined) {
    const beforeSpell = data.beforeSpellState as Record<string, unknown>;
    snaps.beforeState.spellcasting = beforeSpell;
    snaps.afterState.spellcasting = {
      slotsUsed: {},
      arcanumUsed: beforeSpell?.arcanumUsed ?? {},
      spells: beforeSpell?.spells ?? [],
      concentratingOn: beforeSpell?.concentratingOn ?? null,
    };
    delete data.beforeSpellState;
  }
}

/**
 * Item charge-pool recharge (#555) — either rest can fire it (short-trigger
 * pools recharge on short rests too); snapshot so undo re-expends the pool.
 */
function liftChargePoolSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  if (data.chargePoolsBefore !== undefined) {
    snaps.beforeState.chargePools = data.chargePoolsBefore;
    snaps.afterState.chargePools = data.chargePoolsAfter ?? data.chargePoolsBefore;
    delete data.chargePoolsBefore;
    delete data.chargePoolsAfter;
  }
}

/**
 * Phase 3: assemble the before/after sub-state snapshots for the event by
 * running the per-op snapshot lifters above. Each lifter that touches a rest/
 * level snapshot (see liftLevelUpSnapshot / liftLongRestSnapshot /
 * liftShortRestSnapshot / liftChargePoolSnapshot) lifts its keys OUT of
 * eventData into before/after rather than duplicating them in the data payload.
 *
 * @param eventData MUTATED: rest/level snapshot keys (beforeSpellState,
 *   beforeResourceState, chargePoolsBefore, consumableChargesBefore, …) are
 *   lifted into before/after and `delete`d here, so on return `eventData` holds
 *   only the fields that belong in the event's `data` payload.
 */
function buildHpOpSnapshots(
  ctx: HpOpContext,
  op: HpStateOperation,
  beforeHp: HitPoints,
  beforeHd: HitDice,
  eventData: Record<string, unknown>,
): { beforeState: Record<string, unknown>; afterState: Record<string, unknown> } {
  const { hp, hd } = ctx;
  const snaps: HpOpSnapshots = {
    beforeState: { hitPoints: beforeHp, hitDice: beforeHd },
    afterState: { hitPoints: { ...hp }, hitDice: { ...hd } },
  };
  if (op.type === "levelUp") liftLevelUpSnapshot(snaps, eventData);
  if (op.type === "longRest") liftLongRestSnapshot(snaps, eventData);
  if (op.type === "shortRest" || op.type === "longRest") liftChargePoolSnapshot(snaps, eventData);
  if (op.type === "shortRest") liftShortRestSnapshot(snaps, eventData);
  return snaps;
}

/**
 * Phase 4: emit the main hitPoints event. This is the SOLE emitter for the op
 * itself; any follow-on events (buff clears, concentration) come after it.
 */
async function logHpOpEvent(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: HpStateOperation,
  result: HpOpResult,
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: op.type,
    summary: result.summary,
    before: beforeState,
    after: afterState,
    data: result.eventData,
    batchId,
    sessionId,
  });
}

/**
 * Phase 5: follow-on events, in fixed order after the main event: rest
 * buff-clears + activated-use resets, then while-active buff clears, then the
 * damage-triggered concentration check. Returns the concentration check (if
 * one ran) so the route can surface the auto-rolled CON save to the player.
 */
async function applyHpOpFollowOns(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: HpStateOperation,
  hp: HitPoints,
  damageForConcentration: number | null,
  batchId: string,
  sessionId: string | null,
): Promise<ConcentrationCheckResult | null> {
  // A rest clears its matching "until-rest" durable buffs (#455). Long rest
  // clears both short- and long-rest buffs; short rest only short.
  if (op.type === "shortRest" || op.type === "longRest") {
    const rest = op.type === "longRest" ? "long" : "short";
    await clearBuffsForRestInTx(tx, characterId, rest, batchId, sessionId);
    // Recharge item activatedEffect uses on the matching rest (#543).
    await resetActivatedUsesForRestInTx(tx, characterId, rest, batchId, sessionId);
  }

  // A long rest or falling unconscious (0 HP) ends all "while-active" durable
  // self-buffs (e.g. Rage) — the turn-hook covers the "no attack/no damage" case.
  if (op.type === "longRest" || (op.type === "damage" && hp.current === 0)) {
    await clearWhileActiveBuffsInTx(
      tx,
      characterId,
      batchId,
      sessionId,
      op.type === "longRest" ? "long rest" : "unconscious",
    );
  }

  // After the damage event is logged, resolve concentration (issue #41).
  // Logged as a separate "spellcasting" event sharing this batchId so the
  // CON save shows on the timeline and LIFO undo reverses HP + concentration
  // together. `hp.current` here is the post-damage current HP.
  if (damageForConcentration !== null) {
    // `autoRollConcentration: false` (issue #76) defers the save: the check
    // returns a `pending` result and the client follows up with a
    // `concentrationSave` op. Omitted/true keeps today's server-side roll.
    const autoRoll = op.type === "damage" ? op.autoRollConcentration !== false : true;
    return applyConcentrationCheckInTx(
      tx,
      characterId,
      damageForConcentration,
      hp.current,
      batchId,
      sessionId,
      autoRoll,
    );
  }

  return null;
}

// ---- Transaction handler ----

/**
 * Applies a batch of HP operations atomically in one Prisma transaction.
 * State is re-read from the DB per op so a batch of N levelUp ops applies
 * sequentially (each sees the updated total/max/current from the previous).
 * Every meaningful op writes a CharacterEvent (with field-level diffs) in
 * the same transaction so history and state are always consistent.
 */
export async function applyHitPointOperations(
  characterId: string,
  operations: HitPointOperation[]
): Promise<{ concentrationChecks: ConcentrationCheckResult[] }> {
  // One batchId groups all ops in this request on the activity timeline,
  // same as inventory uses (lib/inventory/inventory.ts → applyInventoryOperations).
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);

  // Collect any concentration checks triggered by damage ops so the route can
  // surface the auto-rolled CON save(s) to the player.
  const concentrationChecks: ConcentrationCheckResult[] = [];

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      // A manual concentration save (issue #76) touches no HP — resolve it on
      // its own and skip the HP read/write-back below.
      if (op.type === "concentrationSave") {
        const check = await applyConcentrationSaveInTx(
          tx,
          characterId,
          op.entryId,
          op.roll,
          op.damage,
          batchId,
          sessionId,
        );
        if (check) concentrationChecks.push(check);
        continue;
      }

      // Phase 1: re-read state and build the per-op context.
      const ctx = await buildHpOpContext(tx, characterId);

      // Snapshot the sub-state before this op so the event can show both
      // before/after and the per-field diffs (ctx.beforeClassLevel covers the
      // class-entry level for levelUp).
      const beforeHp = { ...ctx.hp };
      const beforeHd = { ...ctx.hd };

      // Phase 2: apply the op (mutates ctx.hp/ctx.hd in place).
      const result = await dispatchHpOp(ctx, op);
      // For a damage op, a concentration check runs after the common HP
      // write-back below (it needs the post-damage current HP).
      const damageForConcentration = result.damageForConcentration ?? null;

      // Common write-back: every op persists hitPoints + hitDice.
      await tx.character.update({
        where: { id: characterId },
        data: {
          hitPoints: ctx.hp as unknown as Prisma.InputJsonValue,
          hitDice: ctx.hd as unknown as Prisma.InputJsonValue,
        },
      });

      // Phase 3: assemble the event's before/after snapshots (lifts rest-op
      // snapshot keys out of result.eventData).
      const { beforeState, afterState } = buildHpOpSnapshots(ctx, op, beforeHp, beforeHd, result.eventData);

      // Phase 4: emit the main hitPoints event — always FIRST in the batch,
      // before any follow-on events.
      await logHpOpEvent(tx, characterId, op, result, beforeState, afterState, batchId, sessionId);

      // Phase 5: follow-on events (rest buff-clears + activated-use resets,
      // while-active clears, damage-triggered concentration check).
      const check = await applyHpOpFollowOns(
        tx,
        characterId,
        op,
        ctx.hp,
        damageForConcentration,
        batchId,
        sessionId,
      );
      if (check) concentrationChecks.push(check);
    }
  });

  return { concentrationChecks };
}

/**
 * Applies a single heal op inside a caller-supplied Prisma transaction.
 *
 * Exported so the actions orchestrator (routes/actions.ts) can compose a
 * "consume potion + heal" pair into one atomic $transaction without opening a
 * nested transaction. Keep the heal logic in sync with the `case "heal"` branch
 * inside applyHitPointOperations above.
 */
export async function applyHealInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount: number,
  batchId: string,
  sessionId: string | null,
  attribution?: { source?: string },
): Promise<void> {
  if (amount <= 0) {
    throw new InvalidHitPointOperationError("heal amount must be positive");
  }

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      hitPoints: true,
      hitDice: true,
      abilityScores: true,
      experiencePoints: true,
      resources: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { id: true, level: true, name: true, subclass: true },
      },
    },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);

  const advState = normalizeResourcesMutable(row.resources);
  const featSlotCap = advancementSlotsForLevel(
    row.classEntries[0]?.name ?? "",
    levelForExperience(row.experiencePoints),
  );
  const featBonus = deriveFeatBonuses(advState.advancements.slice(0, featSlotCap), hd.total);
  const effMax = hp.max + featBonus.maxHp;

  const beforeHp = { ...hp };

  // Regaining HP while at 0 wakes the character and clears death saves.
  if (hp.current === 0) {
    hp.deathSaves = { successes: 0, failures: 0 };
  }
  hp.current = Math.min(effMax, hp.current + amount);

  await tx.character.update({
    where: { id: characterId },
    data: { hitPoints: hp as unknown as Prisma.InputJsonValue },
  });

  const source = attribution?.source;
  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "heal",
    summary: source
      ? `${source} healed ${amount} HP (${beforeHp.current} → ${hp.current} HP)`
      : `Healed ${amount} HP (${beforeHp.current} → ${hp.current} HP)`,
    before: { hitPoints: beforeHp, hitDice: { ...hd } },
    after: { hitPoints: { ...hp }, hitDice: { ...hd } },
    data: source ? { amount, source } : { amount },
    batchId,
    sessionId,
  });
}

/**
 * Apply damage to a character's HP inside an existing transaction, mirroring
 * the `case "damage"` branch of applyHitPointOperations.
 *
 * Exported so the spellcasting orchestrator (lib/spellcasting/spellcasting.ts) can compose a
 * "cast self-targeted damage spell + take damage" pair into one atomic
 * $transaction without nesting. Keep the damage logic in sync with the
 * `case "damage"` branch above (temp-HP absorption, floor at 0).
 */
export async function applyDamageInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount: number,
  batchId: string,
  sessionId: string | null,
): Promise<ConcentrationCheckResult | null> {
  if (amount <= 0) {
    throw new InvalidHitPointOperationError("damage amount must be positive");
  }

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { hitPoints: true, hitDice: true },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const beforeHp = { ...hp };

  // Temp HP absorbs first, then current. Both floor at 0.
  const absorbed = Math.min(hp.temp, amount);
  hp.temp -= absorbed;
  hp.current = Math.max(0, hp.current - (amount - absorbed));

  await tx.character.update({
    where: { id: characterId },
    data: { hitPoints: hp as unknown as Prisma.InputJsonValue },
  });

  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "damage",
    summary: `Took ${amount} damage (${beforeHp.current} → ${hp.current} HP)`,
    before: { hitPoints: beforeHp, hitDice: { ...hd } },
    after: { hitPoints: { ...hp }, hitDice: { ...hd } },
    data: { amount },
    batchId,
    sessionId,
  });

  // Resolve concentration on this damage instance (issue #41), mirroring the
  // `case "damage"` branch of applyHitPointOperations.
  return applyConcentrationCheckInTx(tx, characterId, amount, hp.current, batchId, sessionId);
}

/**
 * Grant self temporary HP inside an existing transaction (Rally maneuver).
 * Mirrors applySetTempOp: 5e temp HP doesn't stack — take the higher value.
 */
export async function applyTempHpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount: number,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  if (amount <= 0) {
    throw new InvalidHitPointOperationError("temp HP amount must be positive");
  }

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { hitPoints: true, hitDice: true },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const beforeHp = { ...hp };

  hp.temp = Math.max(hp.temp, amount);

  await tx.character.update({
    where: { id: characterId },
    data: { hitPoints: hp as unknown as Prisma.InputJsonValue },
  });

  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "setTemp",
    summary: `Set temporary HP to ${hp.temp}`,
    before: { hitPoints: beforeHp, hitDice: { ...hd } },
    after: { hitPoints: { ...hp }, hitDice: { ...hd } },
    data: { amount },
    batchId,
    sessionId,
  });
}
