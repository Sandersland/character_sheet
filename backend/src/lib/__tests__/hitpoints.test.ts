import { describe, expect, it } from "vitest";

import {
  applyDeathSaveRoll,
  fixedAverageForDie,
  hitDieHeal,
  levelUpHpGain,
  normalizeHitDice,
  normalizeHitPoints,
  resolveDamageResistance,
} from "../hitpoints.js";

describe("resolveDamageResistance", () => {
  const resisted = new Set(["slashing", "piercing", "bludgeoning"]);

  it("halves (round-down) when the damage type matches an active resistance", () => {
    expect(resolveDamageResistance(12, "slashing", resisted)).toEqual({ applied: 6, resisted: true });
    expect(resolveDamageResistance(13, "slashing", resisted)).toEqual({ applied: 6, resisted: true });
  });

  it("leaves a non-matching damage type unaffected", () => {
    expect(resolveDamageResistance(12, "fire", resisted)).toEqual({ applied: 12, resisted: false });
  });

  it("never auto-halves typeless damage", () => {
    expect(resolveDamageResistance(12, undefined, resisted)).toEqual({ applied: 12, resisted: false });
  });

  it("is case-insensitive on the damage type", () => {
    expect(resolveDamageResistance(10, "Slashing", resisted)).toEqual({ applied: 5, resisted: true });
  });

  it("honors the manual override: resist=false declines an otherwise-matching halve", () => {
    expect(resolveDamageResistance(12, "slashing", resisted, false)).toEqual({ applied: 12, resisted: false });
  });

  it("honors the manual override: resist=true forces a halve even without a match", () => {
    expect(resolveDamageResistance(9, "fire", resisted, true)).toEqual({ applied: 4, resisted: true });
    expect(resolveDamageResistance(9, undefined, new Set(), true)).toEqual({ applied: 4, resisted: true });
  });
});

describe("normalizeHitPoints", () => {
  it("round-trips a fully-formed value unchanged", () => {
    const input = { current: 20, max: 30, temp: 5, deathSaves: { successes: 1, failures: 2 } };
    expect(normalizeHitPoints(input)).toEqual(input);
  });

  it("fills in missing fields with safe defaults", () => {
    expect(normalizeHitPoints({ current: 10, max: 10, temp: 0 })).toEqual({
      current: 10,
      max: 10,
      temp: 0,
      deathSaves: { successes: 0, failures: 0 },
    });
  });

  it("handles entirely missing input gracefully", () => {
    const result = normalizeHitPoints(null);
    expect(result.current).toBe(0);
    expect(result.max).toBe(1);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("clamps deathSaves to 0..3", () => {
    const result = normalizeHitPoints({
      current: 0,
      max: 10,
      temp: 0,
      deathSaves: { successes: 5, failures: -1 },
    });
    expect(result.deathSaves).toEqual({ successes: 3, failures: 0 });
  });
});

describe("normalizeHitDice", () => {
  it("round-trips a fully-formed value unchanged", () => {
    const input = { total: 5, die: "d10", spent: 2 };
    expect(normalizeHitDice(input)).toEqual(input);
  });

  it("fills in missing spent with 0", () => {
    expect(normalizeHitDice({ total: 3, die: "d8" })).toEqual({
      total: 3,
      die: "d8",
      spent: 0,
    });
  });
});

describe("fixedAverageForDie", () => {
  it("returns correct 5e PHB fixed values", () => {
    expect(fixedAverageForDie(6)).toBe(4);   // d6 → 4
    expect(fixedAverageForDie(8)).toBe(5);   // d8 → 5
    expect(fixedAverageForDie(10)).toBe(6);  // d10 → 6
    expect(fixedAverageForDie(12)).toBe(7);  // d12 → 7
  });
});

describe("levelUpHpGain", () => {
  it("average method uses the fixed average + conMod", () => {
    expect(levelUpHpGain(10, 2, "average")).toBe(8);  // 6 + 2
    expect(levelUpHpGain(8, -1, "average")).toBe(4);  // 5 - 1
  });

  it("roll method uses the provided die value + conMod", () => {
    expect(levelUpHpGain(10, 2, "roll", 8)).toBe(10); // 8 + 2
    expect(levelUpHpGain(10, -3, "roll", 4)).toBe(1); // 4 - 3 = 1 (floors at 1)
  });

  it("floors at 1 (never 0 or negative) on level-up", () => {
    // Extreme negative Con: d6 roll of 1 with -3 conMod → 1-3 = -2 → clamp to 1
    expect(levelUpHpGain(6, -3, "roll", 1)).toBe(1);
    expect(levelUpHpGain(6, -3, "average")).toBe(1); // 4 - 3 = 1
    expect(levelUpHpGain(6, -4, "average")).toBe(1); // 4 - 4 = 0 → clamp to 1
  });
});

describe("hitDieHeal", () => {
  it("adds conMod to the roll", () => {
    expect(hitDieHeal(6, 2)).toBe(8);
    expect(hitDieHeal(3, -1)).toBe(2);
  });

  it("floors at 0 (not 1) for negative Con", () => {
    expect(hitDieHeal(1, -3)).toBe(0);  // 1 - 3 = -2 → 0
    expect(hitDieHeal(2, -5)).toBe(0);
  });
});

describe("applyDeathSaveRoll", () => {
  const zeroed = { successes: 0, failures: 0 };

  it("nat 20 → current becomes 1, saves reset", () => {
    const result = applyDeathSaveRoll(zeroed, 0, 20);
    expect(result.current).toBe(1);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("nat 1 → +2 failures", () => {
    const result = applyDeathSaveRoll(zeroed, 0, 1);
    expect(result.deathSaves.failures).toBe(2);
    expect(result.current).toBe(0);
  });

  it("2–9 → +1 failure", () => {
    expect(applyDeathSaveRoll(zeroed, 0, 2).deathSaves.failures).toBe(1);
    expect(applyDeathSaveRoll(zeroed, 0, 9).deathSaves.failures).toBe(1);
  });

  it("10–19 → +1 success", () => {
    expect(applyDeathSaveRoll(zeroed, 0, 10).deathSaves.successes).toBe(1);
    expect(applyDeathSaveRoll(zeroed, 0, 19).deathSaves.successes).toBe(1);
  });

  it("3 successes → stable (saves reset, still 0 HP)", () => {
    const twoSuccesses = { successes: 2, failures: 0 };
    const result = applyDeathSaveRoll(twoSuccesses, 0, 15);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(result.current).toBe(0);
  });

  it("clamps failures at 3 (nat 1 with 2 already)", () => {
    const twoFails = { successes: 0, failures: 2 };
    const result = applyDeathSaveRoll(twoFails, 0, 1);
    // nat 1 = +2, but 2+2=4 → clamps to 3
    expect(result.deathSaves.failures).toBe(3);
  });

  it("does not immediately trigger reset when failures reach 3 (dead, not stable)", () => {
    const twoFails = { successes: 0, failures: 2 };
    const result = applyDeathSaveRoll(twoFails, 0, 5);
    // 2+1 = 3 failures → dead, but applyDeathSaveRoll doesn't reset (only stabilize / nat-20 does)
    expect(result.deathSaves.failures).toBe(3);
    expect(result.deathSaves.successes).toBe(0);
    expect(result.current).toBe(0);
  });
});
