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

  // The Two-Weapon Fighting feat's offhandAbilityDamage improvement (#1137, was a
  // style scalar in #732) relaxes the light restriction — passed as a boolean now.
  it("non-light pair → false without the Two-Weapon Fighting improvement", () => {
    expect(canTwoWeaponFight([makeWeapon(false), makeWeapon(false)])).toBe(false);
    // An unrelated feat (no offhand-ability-damage improvement) does not relax it.
    expect(canTwoWeaponFight([makeWeapon(false), makeWeapon(false)], false)).toBe(false);
  });

  it("non-light pair → true WITH the Two-Weapon Fighting improvement", () => {
    expect(
      canTwoWeaponFight([makeWeapon(false), makeWeapon(false)], true),
    ).toBe(true);
    // A mixed pair also qualifies with the improvement.
    expect(
      canTwoWeaponFight([makeWeapon(true), makeWeapon(false)], true),
    ).toBe(true);
  });

  it("the improvement still requires ≥2 equipped weapons", () => {
    expect(canTwoWeaponFight([makeWeapon(false)], true)).toBe(false);
    expect(canTwoWeaponFight([], true)).toBe(false);
  });

  it("two light weapons stay valid regardless of the improvement", () => {
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(true)], false)).toBe(true);
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(true)], true)).toBe(true);
  });
});
