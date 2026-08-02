/**
 * Unit tests for turnRules — pure functions, no React.
 * Mirrors actionResolvers.test.ts style: explicit vitest imports, no globals.
 */

import { describe, expect, it } from "vitest";

import { canTwoWeaponFight } from "@/lib/turnRules";

// deriveAttacksPerAction moved to the backend (srd.ts); Extra Attack counts now
// arrive on the serialized character as `attacksPerAction`.

/** Minimal item shape canTwoWeaponFight actually reads. */
function makeWeapon(light: boolean, equipped = true) {
  return { equipped, category: "weapon" as const, weapon: { light } };
}

describe("canTwoWeaponFight", () => {
  it("two equipped light weapons → true", () => {
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(true)])).toBe(true);
  });

  it("fewer than 2 equipped weapons → false", () => {
    expect(canTwoWeaponFight([])).toBe(false);
    expect(canTwoWeaponFight([makeWeapon(true)])).toBe(false);
  });

  it("two equipped weapons but the second is not light → false", () => {
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(false)])).toBe(false);
  });

  it("two equipped weapons but the first is not light → false", () => {
    expect(canTwoWeaponFight([makeWeapon(false), makeWeapon(true)])).toBe(false);
  });

  it("unequipped weapons are ignored", () => {
    // Two light weapons, but neither equipped → false.
    expect(canTwoWeaponFight([makeWeapon(true, false), makeWeapon(true, false)])).toBe(false);
  });

  it("non-weapon categories are ignored", () => {
    const armor = { equipped: true, category: "armor" as const, weapon: null };
    expect(canTwoWeaponFight([armor, makeWeapon(true)])).toBe(false);
  });

  it("weapon with null weapon detail is excluded", () => {
    const noDetail = { equipped: true, category: "weapon" as const, weapon: null };
    expect(canTwoWeaponFight([noDetail, noDetail])).toBe(false);
  });

  // The signature is the assertion: there is no style/feat flag to pass, so no
  // caller can ask this function to skip the Light check (#1496).
  it("non-light pair → false; the Two-Weapon Fighting style adds damage, it does not waive the Light requirement (SRD 5.1 / PHB'14 p. 72; SRD 5.2)", () => {
    expect(canTwoWeaponFight([makeWeapon(false), makeWeapon(false)])).toBe(false);
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(false)])).toBe(false);
  });
});
