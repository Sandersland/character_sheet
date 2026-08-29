import { rollSpec } from "./dice";

export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

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

export function pointBuyCost(score: number): number {
  const cost = POINT_BUY_COSTS[score];
  if (cost === undefined) {
    throw new RangeError(`Point buy scores must be between 8 and 15 (got ${score})`);
  }
  return cost;
}

export function totalPointBuyCost(scores: readonly number[]): number {
  return scores.reduce((total, score) => total + pointBuyCost(score), 0);
}

export function isValidPointBuy(scores: readonly number[]): boolean {
  if (scores.length !== 6) return false;
  try {
    return totalPointBuyCost(scores) <= POINT_BUY_BUDGET;
  } catch {
    return false;
  }
}

export function roll4d6DropLowest(): number {
  return rollSpec({ count: 4, faces: 6, dropLowest: 1 }).total;
}

export function rollAbilityScoreSet(): number[] {
  return Array.from({ length: 6 }, () => roll4d6DropLowest());
}
