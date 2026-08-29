import type { RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import { exhaustionMaxHpPenalty } from "@/lib/srd/condition-data.js";
import { characterAdvancementSlots } from "@/lib/srd/advancement-slots.js";
import { normalizeResourcesMutable, splitAdvancementsBySlotCap, type AdvancementEntry } from "@/lib/classes/resources-state.js";

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidHitPointOperationError extends Error {
  status = 400;
}

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
  deathSaves: { successes: number; failures: number };
}

export interface HitDice {
  total: number;
  die: string;
  spent: number;
}

// Applied in serializeCharacter so every GET response carries new fields even for rows predating
// deathSaves/spent — no data migration needed.
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

// The one composition every HP-max consumer must call. Order is load-bearing: the feat bonus is added
// to baseMax BEFORE exhaustion's tier-4 halving (PHB'14 p.291) is subtracted — halving first would get
// the rule backwards. Floored at 1 so exhaustion can never zero the maximum; the floor lives HERE, not
// in exhaustionMaxHpPenalty, so that function stays a pure rule with no engineering invariant baked in.
export function effectiveMaxHitPoints(
  baseMax: number,
  // Every pre-halving max-HP addend, composed by the caller (effectiveMaxHitPointsForRow / applyFeatLayer).
  maxHpBonus: number,
  exhaustionLevel: number,
  edition: RulesEdition,
): number {
  const withBonuses = baseMax + maxHpBonus;
  const penalty = exhaustionMaxHpPenalty(exhaustionLevel, withBonuses, edition);
  return Math.max(1, withBonuses - penalty);
}

// Same structural shape as the internal (unexported) AdvancementGatedEntry type used for feat-slot gating.
interface FeatSlotGatedEntry {
  level: number;
  class: { extraAsiLevels: readonly number[] } | null;
}

// The shared "gather" every effectiveMaxHitPoints caller needs before deriveFeatBonuses(kept, hitDiceTotal).maxHp.
// fightingStyleSlotTotal is optional and forwarded verbatim to splitAdvancementsBySlotCap (default Infinity,
// every fs feat kept) — a caller with a real fs cap (mirroring reconcileAdvancements/applyAdvancementOpInTx)
// can pass it instead of silently under-counting a future fs feat with an HP bonus.
export function inCapAdvancementsAt(
  resources: Prisma.JsonValue,
  classEntries: readonly FeatSlotGatedEntry[],
  derivedLevel: number,
  fightingStyleSlotTotal?: number,
): AdvancementEntry[] {
  const advState = normalizeResourcesMutable(resources);
  const featSlotCap = characterAdvancementSlots(classEntries, derivedLevel);
  return splitAdvancementsBySlotCap(advState.advancements, featSlotCap, fightingStyleSlotTotal).kept;
}

export function fixedAverageForDie(faces: number): number {
  return Math.floor(faces / 2) + 1;
}

// For "roll" method, roll is the raw die value sent by the client, validated by the caller to be in range 1..faces.
export function levelUpHpGain(
  faces: number,
  conMod: number,
  method: "average" | "roll",
  roll?: number
): number {
  const dieValue = method === "average" ? fixedAverageForDie(faces) : (roll ?? faces);
  return Math.max(1, dieValue + conMod);
}

// Floors at 0, not 1 like levelUpHpGain — negative Con reduces a die's contribution to 0, never negative or a phantom minimum.
export function hitDieHeal(roll: number, conMod: number): number {
  return Math.max(0, roll + conMod);
}

// Immunity wins over resistance; both honor the player's decline override (applyResistance=false → full damage).
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

// No persisted "dead" flag on 3 failures — the UI infers it from three filled failure pips.
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
    successes = Math.min(3, successes + 1);
  }

  if (successes >= 3) {
    return { deathSaves: { successes: 0, failures: 0 }, current };
  }

  return { deathSaves: { successes, failures }, current };
}
