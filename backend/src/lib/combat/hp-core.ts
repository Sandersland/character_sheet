import { Prisma } from "@/generated/prisma/client.js";

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
