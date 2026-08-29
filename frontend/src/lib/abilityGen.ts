import { rollSpec } from "./dice";
import type { AbilityGenerationConfig } from "@/types/character";

type PointBuyConfig = AbilityGenerationConfig["pointBuy"];

export function pointBuyCost(config: PointBuyConfig, score: number): number {
  const cost = config.costs[score];
  if (cost === undefined) {
    throw new RangeError(`Point buy scores must be between ${config.floor} and ${config.ceiling} (got ${score})`);
  }
  return cost;
}

export function totalPointBuyCost(config: PointBuyConfig, scores: readonly number[]): number {
  return scores.reduce((total, score) => total + pointBuyCost(config, score), 0);
}

// 4d6-drop-lowest rolling is a client-side UX convenience (the animation and
// the roll itself) — the backend never trusts the result, it only sanity-
// bounds it like any "roll"-method submission (validateAbilityScores).
export function roll4d6DropLowest(): number {
  return rollSpec({ count: 4, faces: 6, dropLowest: 1 }).total;
}

export function rollAbilityScoreSet(): number[] {
  return Array.from({ length: 6 }, () => roll4d6DropLowest());
}
