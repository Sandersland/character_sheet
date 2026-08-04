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

// Expected values below are hand-derived from the 5e rule (STR +3 / DEX +2 /
// proficiencyBonus 3), NOT computed by calling either function under test —
// deriveWeaponAttackBonus delegates to deriveWeaponAttackComponents, so
// comparing the components' sum against deriveWeaponAttackBonus's own return
// is a tautology (proven by mutation: zeroing the Archery bonus rule left a
// prior version of this suite fully green). Each case is checked against
// literal numbers so a rule regression actually fails the test.
describe("deriveWeaponAttackComponents — matches hand-derived 5e math", () => {
  const cases: Array<{
    label: string;
    weapon: typeof longsword | typeof longbow | typeof rapier;
    grants: { name: string }[];
    rangedBonus?: number;
    attackRollBonus?: number;
    expected: {
      abilityMod: number;
      proficiencyBonus: number;
      rangedBonus: number;
      attackRollBonus: number;
      ability: "strength" | "dexterity";
    };
  }> = [
    {
      label: "proficient melee",
      weapon: longsword,
      grants: martialGrant,
      expected: { abilityMod: 3, proficiencyBonus: 3, rangedBonus: 0, attackRollBonus: 0, ability: "strength" },
    },
    {
      label: "non-proficient melee",
      weapon: longsword,
      grants: noGrants,
      expected: { abilityMod: 3, proficiencyBonus: 0, rangedBonus: 0, attackRollBonus: 0, ability: "strength" },
    },
    {
      label: "ranged with Archery fighting-style bonus",
      weapon: longbow,
      grants: martialGrant,
      rangedBonus: 2,
      expected: { abilityMod: 2, proficiencyBonus: 3, rangedBonus: 2, attackRollBonus: 0, ability: "dexterity" },
    },
    {
      label: "ranged without the bonus",
      weapon: longbow,
      grants: martialGrant,
      expected: { abilityMod: 2, proficiencyBonus: 3, rangedBonus: 0, attackRollBonus: 0, ability: "dexterity" },
    },
    {
      label: "finesse weapon (uses higher of STR/DEX)",
      weapon: rapier,
      grants: martialGrant,
      expected: { abilityMod: 3, proficiencyBonus: 3, rangedBonus: 0, attackRollBonus: 0, ability: "strength" },
    },
    {
      label: "attack-roll buff active (Sacred Weapon)",
      weapon: longsword,
      grants: martialGrant,
      attackRollBonus: 3,
      expected: { abilityMod: 3, proficiencyBonus: 3, rangedBonus: 0, attackRollBonus: 3, ability: "strength" },
    },
    {
      label: "proficient + ranged bonus + attack-roll buff stacked",
      weapon: longbow,
      grants: martialGrant,
      rangedBonus: 2,
      attackRollBonus: 1,
      expected: { abilityMod: 2, proficiencyBonus: 3, rangedBonus: 2, attackRollBonus: 1, ability: "dexterity" },
    },
  ];

  it.each(cases)("$label", ({ weapon, grants, rangedBonus, attackRollBonus, expected }) => {
    const proficiencyBonus = 3;
    const components = deriveWeaponAttackComponents(
      weapon,
      scores,
      proficiencyBonus,
      grants,
      rangedBonus,
      attackRollBonus,
    );
    expect(components).toEqual(expected);

    // Also confirm the sum still matches deriveWeaponAttackBonus's own return —
    // this alone is the tautological check the mutation defeated, so it stays
    // as a NO-DRIFT regression guard alongside (never instead of) the literals above.
    const expectedTotal = expected.abilityMod + expected.proficiencyBonus + expected.rangedBonus + expected.attackRollBonus;
    expect(
      deriveWeaponAttackBonus(weapon, scores, proficiencyBonus, grants, rangedBonus, attackRollBonus),
    ).toBe(expectedTotal);
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

// #1361: the combat-log drill-in needs to know WHICH ability abilityMod came
// from (finesse takes the higher of STR/DEX, ranged always DEX) to render
// "+ 4 (Dexterity)" instead of a neutral label. Asserted through the real
// derive function, not hardcoded, so a rule regression here would fail.
describe("deriveWeaponAttackComponents — names the governing ability (#1361)", () => {
  const dexOverStr = { strength: 10, dexterity: 16 }; // DEX +3 > STR +0

  it("finesse weapon on a STR > DEX character names strength", () => {
    expect(deriveWeaponAttackComponents(rapier, scores, 3, martialGrant).ability).toBe("strength");
  });

  it("finesse weapon on a DEX > STR character names dexterity", () => {
    expect(deriveWeaponAttackComponents(rapier, dexOverStr, 3, martialGrant).ability).toBe("dexterity");
  });

  it("ranged weapon names dexterity", () => {
    expect(deriveWeaponAttackComponents(longbow, scores, 3, martialGrant).ability).toBe("dexterity");
  });

  it("non-finesse melee weapon names strength", () => {
    expect(deriveWeaponAttackComponents(longsword, scores, 3, martialGrant).ability).toBe("strength");
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

  it("melee weapon, versatile two-handed grip, no buff", () => {
    const d = deriveWeaponDamage(longsword, false, scores);
    expect(d.grip).toBe("versatile-two-handed");
    expect(d.meleeDamageBonus).toBe(0);
    expect(d.abilityModifier + d.meleeDamageBonus).toBe(d.damageModifier);
  });
});

// #1361: same rule, same single source (weaponAbilityMod) as the attack side —
// asserted through the real derive function so a rule regression here fails too.
describe("deriveWeaponDamage — names the governing ability (#1361)", () => {
  const dexOverStr = { strength: 10, dexterity: 16 }; // DEX +3 > STR +0

  it("finesse weapon on a STR > DEX character names strength", () => {
    expect(deriveWeaponDamage(rapier, false, scores).ability).toBe("strength");
  });

  it("finesse weapon on a DEX > STR character names dexterity", () => {
    expect(deriveWeaponDamage(rapier, false, dexOverStr).ability).toBe("dexterity");
  });

  it("ranged weapon names dexterity", () => {
    expect(deriveWeaponDamage(longbow, false, scores).ability).toBe("dexterity");
  });
});
