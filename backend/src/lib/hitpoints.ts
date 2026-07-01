import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { logEvent } from "./events.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";
import {
  abilityModifier,
  advancementSlotsForLevel,
  concentrationSaveDC,
  deriveFeatBonuses,
  deriveFeatProficiencies,
  hitDieFace,
} from "./srd.js";
import { rollDie } from "./dice.js";
import { deriveResources } from "./class-features.js";
import { normalizeResourcesMutable, serializeResourcesState } from "./resources.js";
import { normalizeSpellcastingMutable } from "./spellcasting.js";

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
// These are applied in serializeCharacter (routes/characters.ts) so every
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
  amount: number; // must be > 0
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
 * Level-up: adds 1 to hitDice.total, increases max and current HP.
 * Requires a pending level (derivedLevel > hitDice.total).
 * For "roll" method the client rolls via dice.ts and sends the raw die face;
 * for "average" the server computes the fixed average.
 */
export interface LevelUpOperation {
  type: "levelUp";
  method: "average" | "roll";
  roll?: number; // raw die value (required when method === "roll")
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
export async function applyConcentrationCheckInTx(
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
export async function applyConcentrationSaveInTx(
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
    classEntries: { id: string; level: number; name: string; subclass: string | null }[];
  };
  hp: HitPoints;
  hd: HitDice;
  conMod: number;
  faces: number;
  effMax: number;
  primaryEntry: { id: string; level: number; name: string; subclass: string | null } | undefined;
  beforeClassLevel: number | null;
}

interface HpOpResult {
  summary: string;
  eventData: Record<string, unknown>;
  damageForConcentration?: number;
}

async function applyDamageOp(ctx: HpOpContext, op: DamageOperation): Promise<HpOpResult> {
  const { hp } = ctx;
  if (op.amount <= 0) {
    throw new InvalidHitPointOperationError("damage amount must be positive");
  }
  const beforeCurrent = hp.current;
  // Temp HP absorbs first, then current. Both floor at 0.
  const absorbed = Math.min(hp.temp, op.amount);
  hp.temp -= absorbed;
  hp.current = Math.max(0, hp.current - (op.amount - absorbed));
  // The 5e concentration save uses the full damage of the instance.
  return {
    summary: `Took ${op.amount} damage (${beforeCurrent} → ${hp.current} HP)`,
    eventData: { amount: op.amount },
    damageForConcentration: op.amount,
  };
}

async function applyHealOp(ctx: HpOpContext, op: HealOperation): Promise<HpOpResult> {
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

async function applySetTempOp(ctx: HpOpContext, op: SetTempOperation): Promise<HpOpResult> {
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

async function applyDeathSaveOp(ctx: HpOpContext, op: DeathSaveOperation): Promise<HpOpResult> {
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

async function applyStabilizeOp(ctx: HpOpContext): Promise<HpOpResult> {
  const { hp } = ctx;
  if (hp.current !== 0) {
    throw new InvalidHitPointOperationError(
      "Can only stabilize when at 0 HP (unconscious/dying)"
    );
  }
  hp.deathSaves = { successes: 0, failures: 0 };
  return { summary: "Stabilized", eventData: {} };
}

async function applyLevelUpOp(ctx: HpOpContext, op: LevelUpOperation): Promise<HpOpResult> {
  const { tx, row, hp, hd, conMod, faces, primaryEntry, beforeClassLevel } = ctx;
  const derivedLevel = levelForExperience(row.experiencePoints);
  if (hd.total >= derivedLevel) {
    throw new InvalidHitPointOperationError(
      `No pending level-up: already at level ${hd.total} (XP derives level ${derivedLevel})`
    );
  }
  if (op.method === "roll") {
    if (op.roll === undefined || op.roll < 1 || op.roll > faces) {
      throw new InvalidHitPointOperationError(
        `Roll for level-up must be between 1 and ${faces} (got ${String(op.roll)})`
      );
    }
  }
  const gain = levelUpHpGain(faces, conMod, op.method, op.roll);
  hd.total += 1;
  hp.max += gain;
  hp.current += gain;

  // Repair the position-0 class entry's `level` to match the newly-applied
  // total. The seed defaults all entries to level 1 even for level-7 chars;
  // this self-heals that on the first real level-up.
  if (primaryEntry) {
    await tx.characterClassEntry.update({
      where: { id: primaryEntry.id },
      data: { level: hd.total },
    });
  }

  // Store enough data to exactly reverse this level-up later (Phase 4 undo)
  // or when XP is lowered (auto-reverse in experience-ops.ts).
  return {
    summary: `Leveled up to ${hd.total} (+${gain} HP)`,
    eventData: {
      method: op.method,
      roll: op.roll ?? null,
      conMod,
      faces,
      hpGain: gain,
      primaryEntryId: primaryEntry?.id ?? null,
      prevEntryLevel: beforeClassLevel,
      newEntryLevel: hd.total,
    },
  };
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
  // same as inventory uses (lib/inventory.ts → applyInventoryOperations).
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

      const row = await tx.character.findUnique({
        where: { id: characterId },
        select: {
          hitPoints: true,
          hitDice: true,
          abilityScores: true,
          experiencePoints: true,
          spellcasting: true,
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

      // Snapshot the full sub-state before this op so the event can show
      // both before/after and the per-field diffs. For levelUp, include the
      // class-entry level since the op mutates that too.
      const beforeHp = { ...hp };
      const beforeHd = { ...hd };
      const beforeClassLevel = primaryEntry?.level ?? null;
      let eventData: Record<string, unknown> = {};
      let summary = "";
      // For a damage op, remember that a concentration check should run after the
      // common HP write-back below (needs the post-damage current HP).
      let damageForConcentration: number | null = null;

      const ctx: HpOpContext = {
        tx,
        characterId,
        row,
        hp,
        hd,
        conMod,
        faces,
        effMax,
        primaryEntry,
        beforeClassLevel,
      };
      let result: HpOpResult | null = null;

      switch (op.type) {
        case "damage":
          result = await applyDamageOp(ctx, op);
          break;

        case "heal":
          result = await applyHealOp(ctx, op);
          break;

        case "setTemp":
          result = await applySetTempOp(ctx, op);
          break;

        case "shortRest": {
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
          const totalGain = op.rolls.reduce((sum, roll) => sum + hitDieHeal(roll, conMod), 0);
          hp.current = Math.min(effMax, hp.current + totalGain);
          hd.spent += spending;

          // Reset subclass resources that recharge on short or short-or-long rest
          // (e.g. Battle Master superiority dice recharge on a short rest).
          const srAbilityScores = row.abilityScores as Record<string, number>;
          const srLevel = levelForExperience(row.experiencePoints);
          const srProfBonus = proficiencyBonusForLevel(srLevel);
          const srClassEntry = row.classEntries[0];
          const srDerivedRes = deriveResources(
            srClassEntry?.name ?? "",
            srClassEntry?.subclass ?? undefined,
            srLevel,
            srAbilityScores,
            srProfBonus,
          );
          const srResourceState = normalizeResourcesMutable(row.resources);
          const beforeSrResourceState = {
            used: { ...srResourceState.used },
            maneuversKnown: srResourceState.maneuversKnown.map((m) => ({ ...m })),
          };
          let srResourcesRestored = 0;
          if (srDerivedRes) {
            for (const pool of srDerivedRes.resources) {
              if (pool.recharge === "shortRest" || pool.recharge === "short-or-long") {
                srResourcesRestored += srResourceState.used[pool.key] ?? 0;
                srResourceState.used[pool.key] = 0;
              }
            }
          }

          // Warlock Pact Magic slots recharge on a short rest. A pure Warlock's
          // only spell slots are Pact slots, so clearing slotsUsed is safe here.
          // (Mystic Arcanum is long-rest only — leave arcanumUsed untouched.)
          const srIsWarlock = (srClassEntry?.name ?? "").toLowerCase() === "warlock";
          const srSpellUpdate: Record<string, unknown> = {
            resources: serializeResourcesState(srResourceState),
          };
          let srSlotsRestored = 0;
          let beforeSrSpellState: Record<string, unknown> | undefined;
          if (srIsWarlock) {
            const srSpellState = normalizeSpellcastingMutable(row.spellcasting);
            beforeSrSpellState = {
              slotsUsed: { ...srSpellState.slotsUsed },
              arcanumUsed: { ...srSpellState.arcanumUsed },
              spells: srSpellState.spells.map((s) => ({ ...s })),
              concentratingOn: srSpellState.concentratingOn ? { ...srSpellState.concentratingOn } : null,
            };
            srSlotsRestored = Object.values(srSpellState.slotsUsed).reduce((s, n) => s + n, 0);
            srSpellState.slotsUsed = {};
            // A short rest does NOT end concentration — preserve it.
            srSpellUpdate.spellcasting = {
              slotsUsed: srSpellState.slotsUsed,
              arcanumUsed: srSpellState.arcanumUsed,
              spells: srSpellState.spells,
              concentratingOn: srSpellState.concentratingOn,
            } as unknown as Prisma.InputJsonValue;
          }

          eventData = {
            rolls: op.rolls,
            totalGain,
            conMod,
            resourcesRestored: srResourcesRestored,
            slotsRestored: srSlotsRestored,
            beforeResourceState: beforeSrResourceState,
            ...(beforeSrSpellState ? { beforeSpellState: beforeSrSpellState } : {}),
          };
          const restParts: string[] = [`+${totalGain} HP`];
          if (srSlotsRestored > 0) restParts.push(`${srSlotsRestored} Pact slot${srSlotsRestored !== 1 ? "s" : ""} restored`);
          if (srResourcesRestored > 0) restParts.push(`resources restored`);
          summary = `Short rest — spent ${spending} hit ${spending === 1 ? "die" : "dice"}: ${restParts.join(", ")}`;

          // Write the resource reset (and any Pact slot restore) alongside HP in
          // the character.update below. Route resources through
          // serializeResourcesState so all keys (including toolProficienciesKnown)
          // round-trip — prevents silent data loss on rest.
          await tx.character.update({
            where: { id: characterId },
            data: srSpellUpdate as Prisma.CharacterUpdateInput,
          });
          break;
        }

        case "longRest": {
          const prevCurrent = hp.current;
          hp.current = effMax;
          hp.temp = 0;
          hp.deathSaves = { successes: 0, failures: 0 };
          // Recover hit dice equal to half your total (round down, min 1).
          const recovered = Math.max(1, Math.floor(hd.total / 2));
          hd.spent = Math.max(0, hd.spent - recovered);

          // Reset all spell slot used-counts to 0 (long-rest recovery for every
          // caster, including Warlock Pact slots) and clear Warlock Mystic Arcanum
          // charges. Snapshot the full blob (incl. spells) so undo restores it
          // faithfully rather than wiping the known-spell list.
          const spellState = normalizeSpellcastingMutable(row.spellcasting);
          const beforeSpellState = {
            slotsUsed: { ...spellState.slotsUsed },
            arcanumUsed: { ...spellState.arcanumUsed },
            spells: spellState.spells.map((s) => ({ ...s })),
            concentratingOn: spellState.concentratingOn ? { ...spellState.concentratingOn } : null,
          };
          const slotsRestored =
            Object.values(spellState.slotsUsed).reduce((s, n) => s + n, 0) +
            Object.values(spellState.arcanumUsed).reduce((s, n) => s + n, 0);
          spellState.slotsUsed = {};
          spellState.arcanumUsed = {};
          // A long rest ends any active concentration.
          spellState.concentratingOn = null;

          // Reset subclass resources that recharge on a long rest or short-or-long rest.
          const abilityScores = row.abilityScores as Record<string, number>;
          const derivedLevel = levelForExperience(row.experiencePoints);
          const profBonus = proficiencyBonusForLevel(derivedLevel);
          const primaryClassEntry = row.classEntries[0];
          const derivedRes = deriveResources(
            primaryClassEntry?.name ?? "",
            primaryClassEntry?.subclass ?? undefined,
            derivedLevel,
            abilityScores,
            profBonus,
          );
          const resourceState = normalizeResourcesMutable(row.resources);
          const beforeResourceState = {
            used: { ...resourceState.used },
            maneuversKnown: resourceState.maneuversKnown.map((m) => ({ ...m })),
          };
          let resourcesRestored = 0;
          if (derivedRes) {
            for (const pool of derivedRes.resources) {
              if (pool.recharge === "longRest" || pool.recharge === "short-or-long") {
                resourcesRestored += resourceState.used[pool.key] ?? 0;
                resourceState.used[pool.key] = 0;
              }
            }
          }

          const hpRestored = effMax - prevCurrent;
          eventData = { recovered, hpRestored, slotsRestored, resourcesRestored };
          const parts: string[] = [];
          if (hpRestored > 0) parts.push(`+${hpRestored} HP`);
          else parts.push("HP already full");
          if (slotsRestored > 0) parts.push(`${slotsRestored} slot${slotsRestored !== 1 ? "s" : ""} restored`);
          if (resourcesRestored > 0) parts.push(`resources restored`);
          summary = `Long rest — ${parts.join(", ")}`;

          // Write spellcasting + resources in the same character.update below.
          await tx.character.update({
            where: { id: characterId },
            data: {
              spellcasting: {
                slotsUsed: spellState.slotsUsed,
                arcanumUsed: spellState.arcanumUsed,
                spells: spellState.spells,
                concentratingOn: null,
              } as unknown as Prisma.InputJsonValue,
              resources: serializeResourcesState(resourceState),
            },
          });

          // Include spellcasting + resources in the before/after snapshot for undo.
          (eventData as Record<string, unknown>).beforeSpellState = beforeSpellState;
          (eventData as Record<string, unknown>).beforeResourceState = beforeResourceState;
          break;
        }

        case "levelUp":
          result = await applyLevelUpOp(ctx, op);
          break;

        case "deathSave":
          result = await applyDeathSaveOp(ctx, op);
          break;

        case "stabilize":
          result = await applyStabilizeOp(ctx);
          break;
      }

      if (result) {
        summary = result.summary;
        eventData = result.eventData;
        if (result.damageForConcentration !== undefined) {
          damageForConcentration = result.damageForConcentration;
        }
      }

      await tx.character.update({
        where: { id: characterId },
        data: {
          hitPoints: hp as unknown as Prisma.InputJsonValue,
          hitDice: hd as unknown as Prisma.InputJsonValue,
        },
      });

      // Build the before/after sub-state snapshots. levelUp also captures the
      // class-entry level because the op mutates that outside the JSON columns.
      // longRest captures spellcasting so undoing it re-expends the slots.
      const beforeState: Record<string, unknown> = { hitPoints: beforeHp, hitDice: beforeHd };
      const afterState: Record<string, unknown> = { hitPoints: { ...hp }, hitDice: { ...hd } };
      if (op.type === "levelUp") {
        beforeState.classEntryLevel = beforeClassLevel;
        afterState.classEntryLevel = hd.total;
      }
      if (op.type === "longRest") {
        const data = eventData as Record<string, unknown>;
        const beforeSpell = data.beforeSpellState as Record<string, unknown>;
        beforeState.spellcasting = beforeSpell;
        // Reflect the cleared state, preserving the known-spell list + arcanum keys.
        afterState.spellcasting = { slotsUsed: {}, arcanumUsed: {}, spells: beforeSpell?.spells ?? [], concentratingOn: null };
        delete data.beforeSpellState; // don't duplicate in eventData
        if (data.beforeResourceState !== undefined) {
          beforeState.resources = data.beforeResourceState;
          afterState.resources = data.beforeResourceState; // populated by rest handler
          delete data.beforeResourceState;
        }
      }
      if (op.type === "shortRest") {
        const data = eventData as Record<string, unknown>;
        if (data.beforeResourceState !== undefined) {
          beforeState.resources = data.beforeResourceState;
          delete data.beforeResourceState;
        }
        // Warlock Pact slot restore (present only when the rester is a Warlock).
        if (data.beforeSpellState !== undefined) {
          const beforeSpell = data.beforeSpellState as Record<string, unknown>;
          beforeState.spellcasting = beforeSpell;
          afterState.spellcasting = {
            slotsUsed: {},
            arcanumUsed: beforeSpell?.arcanumUsed ?? {},
            spells: beforeSpell?.spells ?? [],
            concentratingOn: beforeSpell?.concentratingOn ?? null,
          };
          delete data.beforeSpellState;
        }
      }

      await logEvent(tx, {
        characterId,
        category: "hitPoints",
        type: op.type,
        summary,
        before: beforeState,
        after: afterState,
        data: eventData,
        batchId,
        sessionId,
      });

      // After the damage event is logged, resolve concentration (issue #41).
      // Logged as a separate "spellcasting" event sharing this batchId so the
      // CON save shows on the timeline and LIFO undo reverses HP + concentration
      // together. `hp.current` here is the post-damage current HP.
      if (damageForConcentration !== null) {
        // `autoRollConcentration: false` (issue #76) defers the save: the check
        // returns a `pending` result and the client follows up with a
        // `concentrationSave` op. Omitted/true keeps today's server-side roll.
        const autoRoll = op.type === "damage" ? op.autoRollConcentration !== false : true;
        const check = await applyConcentrationCheckInTx(
          tx,
          characterId,
          damageForConcentration,
          hp.current,
          batchId,
          sessionId,
          autoRoll,
        );
        if (check) concentrationChecks.push(check);
      }
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

  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "heal",
    summary: `Healed ${amount} HP (${beforeHp.current} → ${hp.current} HP)`,
    before: { hitPoints: beforeHp, hitDice: { ...hd } },
    after: { hitPoints: { ...hp }, hitDice: { ...hd } },
    data: { amount },
    batchId,
    sessionId,
  });
}

/**
 * Apply damage to a character's HP inside an existing transaction, mirroring
 * the `case "damage"` branch of applyHitPointOperations.
 *
 * Exported so the spellcasting orchestrator (lib/spellcasting.ts) can compose a
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
