/**
 * Pure ability-score generation helpers for the character-creation form.
 * All four 5e generation methods funnel into the same end state: six raw
 * scores the player assigns to abilities, validated client-side before
 * POSTing — the backend (src/lib/srd.ts) only ever sees the final
 * `abilityScores` object, not which method produced it.
 */

/** The classic "standard array" assignment option. */
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

/** Total points available under 5e's point-buy system. */
export const POINT_BUY_BUDGET = 27;

const POINT_BUY_COSTS: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/** The point-buy cost of a single score (valid range 8-15). */
export function pointBuyCost(score: number): number {
  const cost = POINT_BUY_COSTS[score];
  if (cost === undefined) {
    throw new RangeError(`Point buy scores must be between 8 and 15 (got ${score})`);
  }
  return cost;
}

/** Total point-buy cost of a full set of scores. */
export function totalPointBuyCost(scores: readonly number[]): number {
  return scores.reduce((total, score) => total + pointBuyCost(score), 0);
}

/** Whether a set of six point-buy scores fits within the standard budget. */
export function isValidPointBuy(scores: readonly number[]): boolean {
  if (scores.length !== 6) return false;
  try {
    return totalPointBuyCost(scores) <= POINT_BUY_BUDGET;
  } catch {
    return false;
  }
}

function rollD6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/** Rolls 4d6 and drops the lowest die. Range 3-18. */
export function roll4d6DropLowest(): number {
  const rolls = [rollD6(), rollD6(), rollD6(), rollD6()].sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3];
}

/** Rolls a full set of six ability scores for the player to assign. */
export function rollAbilityScoreSet(): number[] {
  return Array.from({ length: 6 }, () => roll4d6DropLowest());
}
