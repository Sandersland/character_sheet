import type { AbilityGenerationMethod } from "@character-sheet/shared-types";

// Both editions print the same six numbers — PHB'14 p.13; SRD 5.2 Character
// Creation, "Step 3: Determine Ability Scores" — no edition fork.
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

// Same budget and cost table in both editions, and the numbers agree, so
// there's no fork — but the editions disagree on the rule's STATUS, not just
// its home page: PHB'14 prints this as the optional "Variant: Customizing
// Ability Scores" sidebar (p.13), while PHB'24 / SRD 5.2 promotes it to a
// standard character-creation method. Don't cite this as "PHB'14 p.13, a
// standard method" — it wasn't one.
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_FLOOR = 8;
export const POINT_BUY_CEILING = 15;

export const POINT_BUY_COSTS: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

// 4d6-drop-lowest's own math, not a PHB table: three kept dice, each 1-6, so
// the total is always 3-18.
export const ROLL_SCORE_FLOOR = 3;
export const ROLL_SCORE_CEILING = 18;

// Ability scores never exceed 20 through the ordinary ASI/level-gated path
// (ABILITY_CAP); only a PHB'24 Epic Boon feat raises one to 30. Manual entry
// has no PHB table to check against (unlike "roll", which has the 3-18 range
// above), so this borrows that absolute ceiling as a permissive sanity
// backstop for both editions' homebrew scores, rather than asserting Epic
// Boon eligibility at creation. Also the fallback for an omitted method.
export const MANUAL_SCORE_FLOOR = 1;
export const MANUAL_SCORE_CEILING = 30;

// A member added to AbilityGenerationMethod without a matching key here is a
// tsc error against `satisfies Record<AbilityGenerationMethod, true>`, not a
// silently-stale array — same pattern as ALL_RULES_EDITIONS.
const ABILITY_GENERATION_METHOD_PRESENCE = {
  standardArray: true,
  pointBuy: true,
  roll: true,
  manual: true,
} satisfies Record<AbilityGenerationMethod, true>;
export const ALL_ABILITY_GENERATION_METHODS: readonly AbilityGenerationMethod[] = Object.keys(
  ABILITY_GENERATION_METHOD_PRESENCE,
) as AbilityGenerationMethod[];

export function pointBuyCost(score: number): number | undefined {
  return POINT_BUY_COSTS[score];
}

// undefined (not a thrown error) on any out-of-table score — the caller
// turns that into its own 400 message rather than catching an exception.
export function totalPointBuyCost(scores: readonly number[]): number | undefined {
  let total = 0;
  for (const score of scores) {
    const cost = pointBuyCost(score);
    if (cost === undefined) return undefined;
    total += cost;
  }
  return total;
}

export type AbilityScoreValidation = { ok: true } | { ok: false; error: string };

function isPermutationOfStandardArray(values: readonly number[]): boolean {
  if (values.length !== STANDARD_ARRAY.length) return false;
  const sorted = [...values].sort((a, b) => a - b);
  const target = [...STANDARD_ARRAY].sort((a, b) => a - b);
  return sorted.every((value, index) => value === target[index]);
}

// A non-integer fails the SAME range check as an out-of-bounds score (not a
// separate pass) — a schema-bypassing caller sending 12.5 must be told its
// score is invalid, never let it fall through to pointBuyCost's lookup miss,
// which would misreport the problem as a budget overspend (12.5 isn't in
// POINT_BUY_COSTS, same as any out-of-table integer).
function outOfIntegerRange(values: readonly number[], floor: number, ceiling: number): number[] {
  return values.filter((v) => !Number.isInteger(v) || v < floor || v > ceiling);
}

/**
 * Validates the character's PRE-bonus ability scores (before species/background
 * spreads apply — resolveBackgroundGrants/resolveSpeciesGrants check the
 * post-bonus total separately against ABILITY_CAP). Cap is method-aware —
 * see postBonusAbilityCap. `roll` gets its own 3-18 dice-math bound. PATCH
 * also runs this, landing in the omitted-method branch below.
 */
export function validateAbilityScores(
  method: AbilityGenerationMethod | undefined,
  scores: Record<string, number>,
): AbilityScoreValidation {
  const values = Object.values(scores);

  if (method === "standardArray") {
    if (!isPermutationOfStandardArray(values)) {
      return {
        ok: false,
        error: `abilityScores must be an assignment of the standard array (${STANDARD_ARRAY.join(", ")})`,
      };
    }
    return { ok: true };
  }

  if (method === "pointBuy") {
    const outOfRange = outOfIntegerRange(values, POINT_BUY_FLOOR, POINT_BUY_CEILING);
    if (outOfRange.length > 0) {
      return {
        ok: false,
        error: `abilityScores: point buy scores must be between ${POINT_BUY_FLOOR} and ${POINT_BUY_CEILING} (got ${outOfRange.join(", ")})`,
      };
    }
    const total = totalPointBuyCost(values);
    if (total === undefined || total > POINT_BUY_BUDGET) {
      return {
        ok: false,
        error: `abilityScores: point buy total cost exceeds the ${POINT_BUY_BUDGET}-point budget`,
      };
    }
    return { ok: true };
  }

  if (method === "roll") {
    const outOfRange = outOfIntegerRange(values, ROLL_SCORE_FLOOR, ROLL_SCORE_CEILING);
    if (outOfRange.length > 0) {
      return {
        ok: false,
        error: `abilityScores: a rolled score must be between ${ROLL_SCORE_FLOOR} and ${ROLL_SCORE_CEILING} (4d6-drop-lowest's range)`,
      };
    }
    return { ok: true };
  }

  // manual or an omitted method (including PATCH, which declares none).
  const outOfRange = outOfIntegerRange(values, MANUAL_SCORE_FLOOR, MANUAL_SCORE_CEILING);
  if (outOfRange.length > 0) {
    return {
      ok: false,
      error: `abilityScores must be between ${MANUAL_SCORE_FLOOR} and ${MANUAL_SCORE_CEILING}`,
    };
  }
  return { ok: true };
}
