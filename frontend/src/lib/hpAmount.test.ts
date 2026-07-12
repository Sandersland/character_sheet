import { describe, it, expect } from "vitest";

import {
  ACCUMULATOR_CHIPS,
  accumulateAmount,
  clampAmount,
  projectHp,
} from "@/lib/hpAmount";

describe("clampAmount", () => {
  it("floors at 0 and caps at 999", () => {
    expect(clampAmount(-5)).toBe(0);
    expect(clampAmount(1500)).toBe(999);
    expect(clampAmount(42)).toBe(42);
  });

  it("truncates fractions and treats NaN as 0", () => {
    expect(clampAmount(3.7)).toBe(3);
    expect(clampAmount(NaN)).toBe(0);
  });
});

describe("accumulateAmount", () => {
  it("adds a chip delta, clamped 0–999", () => {
    expect(accumulateAmount(0, 10)).toBe(10);
    expect(accumulateAmount(10, 20)).toBe(30);
    expect(accumulateAmount(990, 20)).toBe(999);
  });

  it("floors at 0 when the stepper nudges below zero", () => {
    expect(accumulateAmount(0, -1)).toBe(0);
  });

  it("exposes the +1/+5/+10/+20 chip steps", () => {
    expect(ACCUMULATOR_CHIPS).toEqual([1, 5, 10, 20]);
  });
});

describe("projectHp", () => {
  const hp = { current: 20, max: 40, temp: 0 };

  it("damage: subtracts from current and shows current / max", () => {
    expect(projectHp("damage", 3, hp)).toBe("3 HP → 17 / 40");
  });

  it("damage: floors at 0 for lethal amounts", () => {
    expect(projectHp("damage", 100, hp)).toBe("100 HP → 0 / 40");
  });

  it("damage: temp HP absorbs first", () => {
    expect(projectHp("damage", 15, { current: 20, max: 40, temp: 10 })).toBe("15 HP → 15 / 40");
  });

  it("heal: caps at max HP", () => {
    expect(projectHp("heal", 34, hp)).toBe("34 → 40 / 40");
  });

  it("heal: below max adds normally", () => {
    expect(projectHp("heal", 10, { current: 6, max: 40, temp: 0 })).toBe("10 → 16 / 40");
  });

  it("temp: replaces when higher, keeps when lower (no stacking)", () => {
    expect(projectHp("temp", 12, hp)).toBe("Temp 0 → 12");
    expect(projectHp("temp", 5, { current: 20, max: 40, temp: 8 })).toBe("Temp 8 → 8");
  });
});
