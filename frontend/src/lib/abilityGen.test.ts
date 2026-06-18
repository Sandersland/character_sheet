import { afterEach, describe, expect, it, vi } from "vitest";

import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  isValidPointBuy,
  pointBuyCost,
  roll4d6DropLowest,
  rollAbilityScoreSet,
  totalPointBuyCost,
} from "./abilityGen";

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
    // Math.random -> rollD6 via 1 + floor(random * 6). Sequence below
    // produces dice [2, 5, 6, 1]; dropping the 1 leaves 2 + 5 + 6 = 13.
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

describe("STANDARD_ARRAY", () => {
  it("is the fixed 15/14/13/12/10/8 set", () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });
});

describe("pointBuyCost", () => {
  it("returns the SRD cost for each valid score", () => {
    expect(pointBuyCost(8)).toBe(0);
    expect(pointBuyCost(10)).toBe(2);
    expect(pointBuyCost(13)).toBe(5);
    expect(pointBuyCost(15)).toBe(9);
  });

  it("throws for scores outside 8-15", () => {
    expect(() => pointBuyCost(7)).toThrow(RangeError);
    expect(() => pointBuyCost(16)).toThrow(RangeError);
  });
});

describe("totalPointBuyCost / isValidPointBuy", () => {
  it("accepts the standard array as exactly spending the full budget", () => {
    expect(totalPointBuyCost(STANDARD_ARRAY)).toBe(POINT_BUY_BUDGET);
    expect(isValidPointBuy(STANDARD_ARRAY)).toBe(true);
  });

  it("rejects a set that overspends the budget", () => {
    expect(isValidPointBuy([15, 15, 15, 15, 15, 15])).toBe(false);
  });

  it("rejects a set with an out-of-range score", () => {
    expect(isValidPointBuy([16, 8, 8, 8, 8, 8])).toBe(false);
  });

  it("rejects a set that isn't six scores", () => {
    expect(isValidPointBuy([8, 8, 8])).toBe(false);
  });
});
