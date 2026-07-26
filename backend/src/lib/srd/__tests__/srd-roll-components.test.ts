import { describe, it, expect } from "vitest";

import { deriveWeaponAttackBonus, deriveWeaponAttackComponents, deriveWeaponDamage } from "@/lib/srd/srd.js";

const scores = { strength: 16, dexterity: 14 }; // STR +3, DEX +2

const longsword = {
  name: "Longsword",
  finesse: false,
  weaponClass: "martial",
  weaponRange: "melee",
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageType: "slashing",
  versatileDiceCount: 1,
  versatileDiceFaces: 10,
  twoHanded: false,
};

const longbow = {
  name: "Longbow",
  finesse: false,
  weaponClass: "martial",
  weaponRange: "ranged",
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageType: "piercing",
  twoHanded: true,
};

const rapier = {
  name: "Rapier",
  finesse: true,
  weaponClass: "martial",
  weaponRange: "melee",
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageType: "piercing",
  twoHanded: false,
};

const martialGrant = [{ name: "Martial Weapons" }];
const noGrants: { name: string }[] = [];

// The single most important property in #1235: decomposing the to-hit math into
// components must NEVER change the sum deriveWeaponAttackBonus already returns —
// that sum is what the sheet shows today, and this refactor's whole risk is
// silently drifting it. Every case below re-derives the same total two ways.
describe("deriveWeaponAttackComponents — sums to the existing deriveWeaponAttackBonus value", () => {
  const cases: Array<{
    label: string;
    weapon: typeof longsword | typeof longbow | typeof rapier;
    grants: { name: string }[];
    rangedBonus?: number;
    attackRollBonus?: number;
  }> = [
    { label: "proficient melee", weapon: longsword, grants: martialGrant },
    { label: "non-proficient melee", weapon: longsword, grants: noGrants },
    { label: "ranged with Archery fighting-style bonus", weapon: longbow, grants: martialGrant, rangedBonus: 2 },
    { label: "ranged without the bonus", weapon: longbow, grants: martialGrant },
    { label: "finesse weapon (uses higher of STR/DEX)", weapon: rapier, grants: martialGrant },
    { label: "attack-roll buff active (Sacred Weapon)", weapon: longsword, grants: martialGrant, attackRollBonus: 3 },
    {
      label: "proficient + ranged bonus + attack-roll buff stacked",
      weapon: longbow,
      grants: martialGrant,
      rangedBonus: 2,
      attackRollBonus: 1,
    },
  ];

  it.each(cases)("$label", ({ weapon, grants, rangedBonus, attackRollBonus }) => {
    const proficiencyBonus = 3;
    const expectedTotal = deriveWeaponAttackBonus(
      weapon,
      scores,
      proficiencyBonus,
      grants,
      rangedBonus,
      attackRollBonus,
    );
    const components = deriveWeaponAttackComponents(
      weapon,
      scores,
      proficiencyBonus,
      grants,
      rangedBonus,
      attackRollBonus,
    );
    expect(components.abilityMod + components.proficiencyBonus + components.rangedBonus + components.attackRollBonus).toBe(
      expectedTotal,
    );
  });

  it("zeroes proficiencyBonus (not just omits it) when not proficient", () => {
    const c = deriveWeaponAttackComponents(longsword, scores, 3, noGrants);
    expect(c.proficiencyBonus).toBe(0);
    expect(c.abilityMod).toBe(3); // STR mod
  });

  it("zeroes rangedBonus for a melee weapon even when a ranged bonus value is passed", () => {
    const c = deriveWeaponAttackComponents(longsword, scores, 3, martialGrant, 2);
    expect(c.rangedBonus).toBe(0);
  });
});

// deriveWeaponDamage already exposed `abilityModifier` (#732); this issue
// surfaces the other hidden addend, `meleeDamageBonus` (Rage etc.), which today
// is folded silently into `damageModifier`. Same no-drift property: the two
// components must sum to the existing `damageModifier`.
describe("deriveWeaponDamage — meleeDamageBonus component sums to damageModifier", () => {
  it("melee weapon with an active Rage-style buff", () => {
    const d = deriveWeaponDamage(longsword, false, scores, 2);
    expect(d.abilityModifier + d.meleeDamageBonus).toBe(d.damageModifier);
    expect(d.meleeDamageBonus).toBe(2);
  });

  it("ranged weapon never applies the melee buff", () => {
    const d = deriveWeaponDamage(longbow, false, scores, 2);
    expect(d.meleeDamageBonus).toBe(0);
    expect(d.abilityModifier + d.meleeDamageBonus).toBe(d.damageModifier);
  });

  it("finesse melee weapon, versatile two-handed grip, no buff", () => {
    const d = deriveWeaponDamage(longsword, false, scores);
    expect(d.grip).toBe("versatile-two-handed");
    expect(d.meleeDamageBonus).toBe(0);
    expect(d.abilityModifier + d.meleeDamageBonus).toBe(d.damageModifier);
  });
});
