import { describe, expect, it } from "vitest";

import {
  ALL_ABILITY_GENERATION_METHODS,
  POINT_BUY_BUDGET,
  POINT_BUY_CEILING,
  POINT_BUY_FLOOR,
  ROLL_SCORE_CEILING,
  ROLL_SCORE_FLOOR,
  STANDARD_ARRAY,
  pointBuyCost,
  totalPointBuyCost,
  validateAbilityScores,
} from "@/lib/srd/ability-generation.js";

const SCORES = (values: number[]) => ({
  strength: values[0],
  dexterity: values[1],
  constitution: values[2],
  intelligence: values[3],
  wisdom: values[4],
  charisma: values[5],
});

describe("STANDARD_ARRAY / point buy constants", () => {
  it("is the fixed 15/14/13/12/10/8 set", () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });

  it("the standard array spends exactly the point-buy budget", () => {
    expect(totalPointBuyCost(STANDARD_ARRAY)).toBe(POINT_BUY_BUDGET);
  });

  it("pointBuyCost is undefined outside 8-15", () => {
    expect(pointBuyCost(POINT_BUY_FLOOR - 1)).toBeUndefined();
    expect(pointBuyCost(POINT_BUY_CEILING + 1)).toBeUndefined();
  });

  it("lists every AbilityGenerationMethod exactly once", () => {
    expect(new Set(ALL_ABILITY_GENERATION_METHODS)).toEqual(
      new Set(["standardArray", "pointBuy", "roll", "manual"]),
    );
  });
});

describe("validateAbilityScores — standardArray", () => {
  it("accepts any assignment (permutation) of the standard array", () => {
    const result = validateAbilityScores("standardArray", SCORES([8, 10, 12, 13, 14, 15]));
    expect(result.ok).toBe(true);
  });

  it("rejects straight 20s claimed as the standard array", () => {
    const result = validateAbilityScores("standardArray", SCORES([20, 20, 20, 20, 20, 20]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/standard array/i);
  });

  it("rejects a set with one value swapped for a non-array number", () => {
    const result = validateAbilityScores("standardArray", SCORES([15, 14, 13, 12, 10, 9]));
    expect(result.ok).toBe(false);
  });
});

describe("validateAbilityScores — pointBuy", () => {
  it("accepts a set within budget and the 8-15 range", () => {
    const result = validateAbilityScores("pointBuy", SCORES([15, 14, 13, 8, 8, 8]));
    expect(result.ok).toBe(true);
  });

  it("accepts every score at the floor", () => {
    const result = validateAbilityScores("pointBuy", SCORES([8, 8, 8, 8, 8, 8]));
    expect(result.ok).toBe(true);
  });

  it("rejects straight 20s (over the 15 ceiling)", () => {
    const result = validateAbilityScores("pointBuy", SCORES([20, 20, 20, 20, 20, 20]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/8 and 15/);
  });

  it("rejects a legal-range set that overspends the 27-point budget", () => {
    const result = validateAbilityScores("pointBuy", SCORES([15, 15, 15, 15, 15, 15]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/budget/i);
  });

  // A non-integer must fail the range check, not fall through to the lookup
  // miss in totalPointBuyCost and get misreported as a budget overspend.
  it("rejects a non-integer score with a range error, not a budget error", () => {
    const result = validateAbilityScores("pointBuy", SCORES([12.5, 10, 10, 10, 10, 10]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/8 and 15/);
      expect(result.error).not.toMatch(/budget/i);
    }
  });
});

describe("validateAbilityScores — roll (4d6-drop-lowest's 3-18 range)", () => {
  it("accepts scores at the floor and ceiling", () => {
    expect(validateAbilityScores("roll", SCORES([ROLL_SCORE_FLOOR, ROLL_SCORE_CEILING, 12, 13, 14, 17])).ok).toBe(true);
  });

  it("rejects a score above the ceiling (impossible from 4d6-drop-lowest)", () => {
    const result = validateAbilityScores("roll", SCORES([ROLL_SCORE_CEILING + 1, 10, 10, 10, 10, 10]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/3 and 18/);
  });

  it("rejects a score below the floor", () => {
    const result = validateAbilityScores("roll", SCORES([ROLL_SCORE_FLOOR - 1, 10, 10, 10, 10, 10]));
    expect(result.ok).toBe(false);
  });

  // Straight 20s is exactly the original vulnerability's number, and 20 is
  // outside dice range regardless of the wider manual/omitted bound.
  it("rejects straight 20s", () => {
    const result = validateAbilityScores("roll", SCORES([20, 20, 20, 20, 20, 20]));
    expect(result.ok).toBe(false);
  });
});

describe("validateAbilityScores — manual / undeclared (1-30 sanity bound)", () => {
  it("accepts scores within the 1-30 sanity bound for manual entry", () => {
    expect(validateAbilityScores("manual", SCORES([1, 30, 18, 3, 20, 10])).ok).toBe(true);
  });

  it("accepts the same bound when the method is omitted (e.g. a PATCH)", () => {
    expect(validateAbilityScores(undefined, SCORES([10, 10, 10, 10, 10, 10])).ok).toBe(true);
  });

  it("rejects a score above 30", () => {
    const result = validateAbilityScores("manual", SCORES([31, 10, 10, 10, 10, 10]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1 and 30/);
  });

  it("rejects a score below 1", () => {
    const result = validateAbilityScores(undefined, SCORES([0, 10, 10, 10, 10, 10]));
    expect(result.ok).toBe(false);
  });

  // Manual's own 1-30 bound is wider than roll's 3-18 — a score above
  // ROLL_SCORE_CEILING is still legal here, even though it's impossible from
  // 4d6-drop-lowest.
  it("accepts a score above roll's ceiling (manual is not dice-bound)", () => {
    expect(validateAbilityScores("manual", SCORES([ROLL_SCORE_CEILING + 1, 10, 10, 10, 10, 10])).ok).toBe(true);
  });
});
