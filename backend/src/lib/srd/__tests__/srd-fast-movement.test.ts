import { describe, it, expect } from "vitest";

import { deriveFastMovement } from "@/lib/srd/srd.js";

const bonus = (barbarianLevel: number, wearingHeavyArmor = false) =>
  deriveFastMovement({ barbarianLevel, wearingHeavyArmor });

describe("deriveFastMovement", () => {
  it("level-4 barbarian gets no bonus", () => {
    expect(bonus(4)).toBe(0);
  });

  it("level-5 barbarian without heavy armor gets +10", () => {
    expect(bonus(5)).toBe(10);
  });

  it("crosses the threshold exactly at level 5", () => {
    expect(bonus(4)).toBe(0);
    expect(bonus(5)).toBe(10);
  });

  it("does not scale beyond +10 at higher levels", () => {
    expect(bonus(10)).toBe(10);
    expect(bonus(20)).toBe(10);
  });

  it("heavy armor removes the bonus", () => {
    expect(bonus(5, true)).toBe(0);
    expect(bonus(20, true)).toBe(0);
  });

  it("light/medium/no armor all qualify (heavy is the only disqualifier)", () => {
    // wearingHeavyArmor is false for light, medium, and unarmored alike.
    expect(bonus(5, false)).toBe(10);
  });

  it("non-barbarian (barbarianLevel 0) never gets a bonus", () => {
    expect(bonus(0)).toBe(0);
    expect(bonus(0, true)).toBe(0);
  });
});
