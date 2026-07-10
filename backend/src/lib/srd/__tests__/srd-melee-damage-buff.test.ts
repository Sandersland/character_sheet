import { describe, it, expect } from "vitest";

import { deriveWeaponDamage } from "@/lib/srd/srd.js";

const scores = { strength: 16, dexterity: 12 }; // STR +3, DEX +1

const melee = {
  name: "Greataxe",
  finesse: false,
  weaponRange: "melee",
  damageDiceCount: 1,
  damageDiceFaces: 12,
  damageType: "slashing",
  twoHanded: true,
};

const ranged = {
  name: "Longbow",
  finesse: false,
  weaponRange: "ranged",
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageType: "piercing",
  twoHanded: true,
};

describe("deriveWeaponDamage — meleeDamage buff", () => {
  it("adds the melee-damage bonus to a melee weapon's damage modifier", () => {
    const base = deriveWeaponDamage(melee, false, scores);
    const raged = deriveWeaponDamage(melee, false, scores, 2);
    expect(base.damageModifier).toBe(3); // STR mod only
    expect(raged.damageModifier).toBe(5); // STR + 2 buff
  });

  it("leaves a ranged weapon's damage untouched", () => {
    const raged = deriveWeaponDamage(ranged, false, scores, 2);
    expect(raged.damageModifier).toBe(1); // DEX mod only, no buff
  });

  it("defaults to no bonus when the buff sum is omitted", () => {
    expect(deriveWeaponDamage(melee, false, scores).damageModifier).toBe(3);
  });

  it("does not apply the bonus to a null-range (custom) weapon", () => {
    const custom = { ...melee, weaponRange: null };
    expect(deriveWeaponDamage(custom, false, scores, 2).damageModifier).toBe(3);
  });
});
