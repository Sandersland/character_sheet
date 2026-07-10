import { describe, it, expect } from "vitest";

import { deriveUnarmoredMovement } from "@/lib/srd.js";

const bonus = (monkLevel: number, isUnarmored = true, hasShield = false) =>
  deriveUnarmoredMovement({ monkLevel, isUnarmored, hasShield });

describe("deriveUnarmoredMovement", () => {
  it("level-1 monk gets no bonus", () => {
    expect(bonus(1)).toBe(0);
  });

  it("levels 2-5 grant +10", () => {
    expect(bonus(2)).toBe(10);
    expect(bonus(5)).toBe(10);
  });

  it("levels 6-9 grant +15", () => {
    expect(bonus(6)).toBe(15);
    expect(bonus(9)).toBe(15);
  });

  it("levels 10-13 grant +20", () => {
    expect(bonus(10)).toBe(20);
    expect(bonus(13)).toBe(20);
  });

  it("levels 14-17 grant +25", () => {
    expect(bonus(14)).toBe(25);
    expect(bonus(17)).toBe(25);
  });

  it("levels 18+ grant +30", () => {
    expect(bonus(18)).toBe(30);
    expect(bonus(20)).toBe(30);
  });

  it("crosses each threshold at the exact boundary", () => {
    expect(bonus(5)).toBe(10);
    expect(bonus(6)).toBe(15);
    expect(bonus(9)).toBe(15);
    expect(bonus(10)).toBe(20);
    expect(bonus(13)).toBe(20);
    expect(bonus(14)).toBe(25);
    expect(bonus(17)).toBe(25);
    expect(bonus(18)).toBe(30);
  });

  it("wearing body armor removes the bonus at every level", () => {
    expect(bonus(2, false, false)).toBe(0);
    expect(bonus(10, false, false)).toBe(0);
    expect(bonus(18, false, false)).toBe(0);
  });

  it("wielding a shield removes the bonus even when otherwise unarmored", () => {
    expect(bonus(2, true, true)).toBe(0);
    expect(bonus(18, true, true)).toBe(0);
  });

  it("non-monk (monkLevel 0) never gets a bonus", () => {
    expect(bonus(0)).toBe(0);
    expect(bonus(0, true, true)).toBe(0);
    expect(bonus(0, false, false)).toBe(0);
  });
});
