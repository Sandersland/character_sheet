import { describe, expect, it } from "vitest";

import {
  isProficientWithArmor,
  isProficientWithItem,
  isProficientWithWeapon,
} from "@/lib/srd/proficiencies.js";
import * as barrel from "@/lib/srd/srd.js";

// Pure unit tests — no DB. Pins the proficiency rules now that they are
// exported for reuse (#1432); the assertions mirror the frontend mirror's
// `isProficientWithItem` block so a divergence shows up here.

const simpleWeapon = { category: "weapon", name: "Club", weaponClass: "simple" } as const;
const martialWeapon = { category: "weapon", name: "Longsword", weaponClass: "martial" } as const;
const bodyArmor = { category: "armor", name: "Chain Shirt", armorCategory: "medium" } as const;
const shield = { category: "armor", name: "Shield", armorCategory: "shield" } as const;

describe("srd.ts barrel re-exports the proficiency rules (#1432)", () => {
  it("binds the same functions as proficiencies.js, not copies", () => {
    // Identity alone would hold vacuously if both sides were undefined.
    expect(barrel.isProficientWithWeapon).toBeInstanceOf(Function);
    expect(barrel.isProficientWithArmor).toBeInstanceOf(Function);
    expect(barrel.isProficientWithItem).toBeInstanceOf(Function);
    expect(barrel.isProficientWithWeapon).toBe(isProficientWithWeapon);
    expect(barrel.isProficientWithArmor).toBe(isProficientWithArmor);
    expect(barrel.isProficientWithItem).toBe(isProficientWithItem);
  });
});

describe("isProficientWithItem (#554)", () => {
  it("matches weapon category grants against weaponClass", () => {
    expect(isProficientWithItem(simpleWeapon, [{ name: "Simple Weapons" }], [])).toBe(true);
    expect(isProficientWithItem(martialWeapon, [{ name: "Simple Weapons" }], [])).toBe(false);
    expect(isProficientWithItem(martialWeapon, [{ name: "Martial Weapons" }], [])).toBe(true);
  });

  it("matches a pluralised specific-weapon grant against the singular catalog name", () => {
    expect(isProficientWithItem(martialWeapon, [{ name: "Longswords" }], [])).toBe(true);
    expect(isProficientWithItem(martialWeapon, [{ name: "Shortswords" }], [])).toBe(false);
  });

  it("warns (false) when no grant covers the weapon", () => {
    expect(isProficientWithItem(simpleWeapon, [], [])).toBe(false);
  });

  it("matches armor by category, including shields", () => {
    expect(isProficientWithItem(bodyArmor, [], [{ category: "medium" }])).toBe(true);
    expect(isProficientWithItem(bodyArmor, [], [{ category: "light" }])).toBe(false);
    expect(isProficientWithItem(shield, [], [{ category: "shield" }])).toBe(true);
  });

  it("never warns on items that carry no proficiency requirement", () => {
    expect(isProficientWithItem({ category: "gear", name: "Rope" }, [], [])).toBe(true);
    expect(isProficientWithItem({ category: "consumable", name: "Potion" }, [], [])).toBe(true);
    expect(isProficientWithItem({ category: "armor", name: "Odd Plate" }, [], [])).toBe(true);
  });

  // The one place the two rules deliberately disagree, and the reason
  // `isProficientWithItem` is a wrapper instead of an edit to
  // `isProficientWithWeapon`: the no-warn default is a UI policy, while the
  // attack-bonus rule must keep denying the proficiency bonus to a weapon whose
  // class is unknown. Collapsing them would move `attackBonusComponents`.
  it("defaults a class-less weapon to proficient where the attack rule does not", () => {
    const homebrew = { category: "weapon", name: "Odd Blade" } as const;
    expect(isProficientWithItem(homebrew, [], [])).toBe(true);
    expect(isProficientWithWeapon(homebrew, [])).toBe(false);
  });
});

describe("isProficientWithArmor", () => {
  it("matches a category-keyed grant and rejects a mismatch", () => {
    expect(isProficientWithArmor("heavy", [{ category: "heavy" }])).toBe(true);
    expect(isProficientWithArmor("heavy", [{ category: "medium" }])).toBe(false);
  });

  it("is proficient when the armor declares no category", () => {
    expect(isProficientWithArmor(null, [])).toBe(true);
  });
});
