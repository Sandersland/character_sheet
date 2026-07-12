import { describe, it, expect } from "vitest";

import {
  ACCUMULATOR_CHIPS,
  accumulateAmount,
  clampAmount,
  deriveHpApply,
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

  it("exposes the +5/+10/+20 chip steps", () => {
    expect(ACCUMULATOR_CHIPS).toEqual([5, 10, 20]);
  });
});

describe("deriveHpApply", () => {
  it("parses the raw amount, empty string as 0", () => {
    expect(deriveHpApply("damage", "17", "", [], true).numericAmount).toBe(17);
    expect(deriveHpApply("damage", "", "", [], true).numericAmount).toBe(0);
  });

  it("halves only when the chosen type is resisted AND resistance is applied (#456)", () => {
    const resisted = deriveHpApply("damage", "17", "fire", ["fire"], true);
    expect(resisted).toEqual({ numericAmount: 17, isResisted: true, halved: 8, effectiveAmount: 8 });
    expect(deriveHpApply("damage", "17", "fire", ["fire"], false).effectiveAmount).toBe(17);
    expect(deriveHpApply("damage", "17", "cold", ["fire"], true).isResisted).toBe(false);
    expect(deriveHpApply("damage", "17", "", ["fire"], true).isResisted).toBe(false);
  });

  it("never marks heal/temp as resisted", () => {
    expect(deriveHpApply("heal", "17", "fire", ["fire"], true).isResisted).toBe(false);
    expect(deriveHpApply("temp", "17", "fire", ["fire"], true).isResisted).toBe(false);
  });
});

describe("projectHp", () => {
  const hp = { current: 20, max: 40, temp: 0 };

  it("damage: subtracts from current and shows current / max, no amount prefix", () => {
    expect(projectHp("damage", 3, hp)).toBe("→ 17 / 40");
  });

  it("damage: floors at 0 for lethal amounts", () => {
    expect(projectHp("damage", 100, hp)).toBe("→ 0 / 40");
  });

  it("damage: temp HP absorbs first", () => {
    expect(projectHp("damage", 15, { current: 20, max: 40, temp: 10 })).toBe("→ 15 / 40");
  });

  it("heal: caps at max HP", () => {
    expect(projectHp("heal", 34, hp)).toBe("→ 40 / 40");
  });

  it("heal: below max adds normally", () => {
    expect(projectHp("heal", 10, { current: 6, max: 40, temp: 0 })).toBe("→ 16 / 40");
  });

  it("temp: replaces when higher, keeps when lower (no stacking)", () => {
    expect(projectHp("temp", 12, hp)).toBe("Temp → 12");
    expect(projectHp("temp", 5, { current: 20, max: 40, temp: 8 })).toBe("Temp → 8");
  });
});
