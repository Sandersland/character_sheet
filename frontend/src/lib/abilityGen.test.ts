import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pointBuyCost,
  roll4d6DropLowest,
  rollAbilityScoreSet,
  totalPointBuyCost,
} from "./abilityGen";
import type { AbilityGenerationConfig } from "@/types/character";

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_BUY: AbilityGenerationConfig["pointBuy"] = {
  budget: 27,
  floor: 8,
  ceiling: 15,
  costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
};

describe("roll4d6DropLowest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays within the 3-18 range across many rolls", () => {
    for (let i = 0; i < 200; i++) {
      const score = roll4d6DropLowest();
      expect(score).toBeGreaterThanOrEqual(3);
      expect(score).toBeLessThanOrEqual(18);
      expect(Number.isInteger(score)).toBe(true);
    }
  });

  it("drops the lowest of the four dice", () => {
    const sequence = [
      (2 - 1) / 6,
      (5 - 1) / 6,
      (6 - 1) / 6,
      (1 - 1) / 6,
    ];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++]);

    expect(roll4d6DropLowest()).toBe(13);
  });
});

describe("rollAbilityScoreSet", () => {
  it("returns six scores, each in range", () => {
    const scores = rollAbilityScoreSet();
    expect(scores).toHaveLength(6);
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(3);
      expect(score).toBeLessThanOrEqual(18);
    }
  });
});

describe("pointBuyCost", () => {
  it("returns the served cost for each valid score", () => {
    expect(pointBuyCost(POINT_BUY, 8)).toBe(0);
    expect(pointBuyCost(POINT_BUY, 10)).toBe(2);
    expect(pointBuyCost(POINT_BUY, 13)).toBe(5);
    expect(pointBuyCost(POINT_BUY, 15)).toBe(9);
  });

  it("throws for scores outside the served floor/ceiling", () => {
    expect(() => pointBuyCost(POINT_BUY, 7)).toThrow(RangeError);
    expect(() => pointBuyCost(POINT_BUY, 16)).toThrow(RangeError);
  });
});

describe("totalPointBuyCost", () => {
  it("accepts the standard array as exactly spending the full budget", () => {
    expect(totalPointBuyCost(POINT_BUY, STANDARD_ARRAY)).toBe(POINT_BUY.budget);
  });
});
