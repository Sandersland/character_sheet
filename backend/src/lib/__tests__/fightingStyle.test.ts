import { describe, it, expect } from "vitest";

import {
  FIGHTING_STYLES,
  isKnownFightingStyle,
  fightingStyleChoiceCount,
  deriveFightingStyleBonuses,
  deriveWeaponAttackBonus,
  type FightingStyleKey,
} from "../srd.js";

describe("FIGHTING_STYLES data block", () => {
  it("defines the 6 core fighting styles with key/label/description", () => {
    const keys = FIGHTING_STYLES.map((s) => s.key).sort();
    expect(keys).toEqual(
      [
        "archery",
        "defense",
        "dueling",
        "greatWeaponFighting",
        "protection",
        "twoWeaponFighting",
      ].sort(),
    );
    for (const style of FIGHTING_STYLES) {
      expect(typeof style.label).toBe("string");
      expect(style.label.length).toBeGreaterThan(0);
      expect(typeof style.description).toBe("string");
      expect(style.description.length).toBeGreaterThan(0);
    }
  });
});

describe("isKnownFightingStyle", () => {
  it("returns true for known keys", () => {
    expect(isKnownFightingStyle("archery")).toBe(true);
    expect(isKnownFightingStyle("defense")).toBe(true);
  });
  it("returns false for unknown keys", () => {
    expect(isKnownFightingStyle("notARealStyle")).toBe(false);
    expect(isKnownFightingStyle("")).toBe(false);
  });
});

describe("fightingStyleChoiceCount", () => {
  it("Fighter at level >= 1 gets 1 choice", () => {
    expect(fightingStyleChoiceCount("fighter", 1)).toBe(1);
    expect(fightingStyleChoiceCount("Fighter", 5)).toBe(1);
    expect(fightingStyleChoiceCount("fighter", 20)).toBe(1);
  });
  it("non-fighters get 0", () => {
    expect(fightingStyleChoiceCount("wizard", 5)).toBe(0);
    expect(fightingStyleChoiceCount("rogue", 6)).toBe(0);
    expect(fightingStyleChoiceCount("paladin", 5)).toBe(0);
  });
  it("level 0 fighter gets 0", () => {
    expect(fightingStyleChoiceCount("fighter", 0)).toBe(0);
  });
});

describe("deriveFightingStyleBonuses", () => {
  it("defense grants +1 armorClass", () => {
    expect(deriveFightingStyleBonuses("defense")).toEqual({ armorClass: 1 });
  });
  it("non-AC styles grant +0 armorClass", () => {
    for (const key of ["archery", "dueling", "greatWeaponFighting", "protection", "twoWeaponFighting"] as FightingStyleKey[]) {
      expect(deriveFightingStyleBonuses(key)).toEqual({ armorClass: 0 });
    }
  });
  it("null/undefined style grants no bonus", () => {
    expect(deriveFightingStyleBonuses(null)).toEqual({ armorClass: 0 });
    expect(deriveFightingStyleBonuses(undefined)).toEqual({ armorClass: 0 });
  });
});

describe("deriveWeaponAttackBonus with archery fighting style", () => {
  const scores = { strength: 10, dexterity: 16 }; // +3 DEX, +0 STR
  const noGrants: ReadonlyArray<{ name: string }> = [];

  it("archery adds +2 to a ranged weapon's attack bonus", () => {
    const rangedWeapon = { name: "Longbow", finesse: false, weaponRange: "ranged" };
    const without = deriveWeaponAttackBonus(rangedWeapon, scores, 2, noGrants);
    const withArchery = deriveWeaponAttackBonus(rangedWeapon, scores, 2, noGrants, "archery");
    expect(withArchery).toBe(without + 2);
  });

  it("archery does not affect a melee weapon", () => {
    const meleeWeapon = { name: "Longsword", finesse: false, weaponRange: "melee" };
    const without = deriveWeaponAttackBonus(meleeWeapon, scores, 2, noGrants);
    const withArchery = deriveWeaponAttackBonus(meleeWeapon, scores, 2, noGrants, "archery");
    expect(withArchery).toBe(without);
  });

  it("a non-archery style does not affect a ranged weapon", () => {
    const rangedWeapon = { name: "Longbow", finesse: false, weaponRange: "ranged" };
    const without = deriveWeaponAttackBonus(rangedWeapon, scores, 2, noGrants);
    const withDefense = deriveWeaponAttackBonus(rangedWeapon, scores, 2, noGrants, "defense");
    expect(withDefense).toBe(without);
  });
});
