import { describe, it, expect } from "vitest";

import {
  attacksExhausted,
  buildAttackEntries,
  hasSuperiorityDice,
  unarmedDamageDisplay,
  weaponDamageSpec,
  weaponDamageType,
  weaponGripLabel,
} from "@/lib/attackMath";
import type { Character, WeaponDetail } from "@/types/character";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    inventory: [],
    unarmedStrike: {
      attackBonus: 2,
      damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" },
    },
    improvisedWeapon: {
      attackBonus: 2,
      damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" },
      proficient: false,
    },
    resources: { pools: [] },
    ...overrides,
  } as unknown as Character;
}

function weaponItem(weapon: Partial<WeaponDetail>, name = "Longsword", id = "inv-1") {
  return {
    id,
    name,
    category: "weapon" as const,
    quantity: 1,
    equipped: true,
    weapon: weapon as WeaponDetail,
  };
}

describe("weaponDamageSpec", () => {
  it("uses legacy flat fields when server-derived damage is absent", () => {
    const spec = weaponDamageSpec({
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageModifier: 3,
      damageType: "slashing",
    } as WeaponDetail);
    expect(spec).toEqual({ count: 1, faces: 8, modifier: 3 });
  });

  it("prefers grip-resolved damage when present", () => {
    const spec = weaponDamageSpec({
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageModifier: 0,
      damageType: "slashing",
      damage: { damageDiceCount: 1, damageDiceFaces: 10, damageModifier: 2, damageType: "slashing", grip: "versatile-two-handed" },
    } as WeaponDetail);
    expect(spec).toEqual({ count: 1, faces: 10, modifier: 2 });
  });
});

describe("weaponDamageType", () => {
  it("prefers grip-resolved type, falls back to flat", () => {
    expect(weaponDamageType({ damageType: "piercing" } as WeaponDetail)).toBe("piercing");
    expect(
      weaponDamageType({ damageType: "piercing", damage: { damageType: "slashing", grip: "one-handed" } } as WeaponDetail),
    ).toBe("slashing");
  });
});

describe("weaponGripLabel", () => {
  it("labels two-handed grips and stays silent otherwise", () => {
    expect(weaponGripLabel({ damage: { grip: "versatile-two-handed" } } as WeaponDetail)).toBe(" (two-handed)");
    expect(weaponGripLabel({ damage: { grip: "two-handed" } } as WeaponDetail)).toBe(" (two-handed)");
    expect(weaponGripLabel({ damage: { grip: "one-handed" } } as WeaponDetail)).toBe("");
    expect(weaponGripLabel({} as WeaponDetail)).toBe("");
  });
});

describe("unarmedDamageDisplay", () => {
  it("renders a flat value when faces === 1", () => {
    expect(unarmedDamageDisplay({ attackBonus: 0, damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" } })).toBe(1);
    expect(unarmedDamageDisplay({ attackBonus: 0, damage: { count: 1, faces: 1, modifier: 2, damageType: "bludgeoning" } })).toBe(3);
  });

  it("renders die notation when faces > 1", () => {
    expect(unarmedDamageDisplay({ attackBonus: 0, damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" } })).toBe("1d4");
    expect(unarmedDamageDisplay({ attackBonus: 0, damage: { count: 1, faces: 6, modifier: 2, damageType: "bludgeoning" } })).toBe("1d6 + 2");
  });

  it("dash-separates a negative modifier using its absolute value", () => {
    expect(unarmedDamageDisplay({ attackBonus: 0, damage: { count: 1, faces: 6, modifier: -1, damageType: "bludgeoning" } })).toBe("1d6 - 1");
    expect(unarmedDamageDisplay({ attackBonus: 0, damage: { count: 1, faces: 4, modifier: -2, damageType: "bludgeoning" } })).toBe("1d4 - 2");
  });
});

describe("hasSuperiorityDice", () => {
  it("is true only when a superiorityDice pool with total > 0 exists", () => {
    expect(hasSuperiorityDice(makeCharacter())).toBe(false);
    expect(
      hasSuperiorityDice(makeCharacter({ resources: { pools: [{ key: "superiorityDice", total: 4 }] } as unknown as Character["resources"] })),
    ).toBe(true);
    expect(
      hasSuperiorityDice(makeCharacter({ resources: { pools: [{ key: "superiorityDice", total: 0 }] } as unknown as Character["resources"] })),
    ).toBe(false);
  });
});

describe("attacksExhausted", () => {
  it("always allows when the attack counter is null", () => {
    expect(attacksExhausted(null)).toBe(false);
  });

  it("is false under the limit and true at/over it", () => {
    expect(attacksExhausted({ used: 0, total: 1 })).toBe(false);
    expect(attacksExhausted({ used: 1, total: 1 })).toBe(true);
    expect(attacksExhausted({ used: 2, total: 1 })).toBe(true);
  });
});

describe("buildAttackEntries", () => {
  it("orders equipped weapons, then unarmed, then improvised", () => {
    const character = makeCharacter({
      inventory: [
        weaponItem({ attackBonus: 5, damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 3, damageType: "slashing" }),
      ] as unknown as Character["inventory"],
    });
    const entries = buildAttackEntries(character);
    expect(entries.map((e) => e.id)).toEqual(["inv-1", "unarmed", "improvised"]);
  });

  it("emits exact roll-source and log-source strings for a weapon", () => {
    const character = makeCharacter({
      inventory: [
        weaponItem({ attackBonus: 5, damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 3, damageType: "slashing" }),
      ] as unknown as Character["inventory"],
    });
    const [weapon] = buildAttackEntries(character);
    expect(weapon.attackLabel).toBe("+5");
    expect(weapon.damageLabel).toBe("1d8 + 3 slashing");
    expect(weapon.attackSpec).toEqual({ count: 1, faces: 20, modifier: 5 });
    expect(weapon.damageSpec).toEqual({ count: 1, faces: 8, modifier: 3 });
    expect(weapon.damageType).toBe("slashing");
    expect(weapon.attackRollLabel).toBe("Longsword attack");
    expect(weapon.damageRollLabel).toBe("Longsword damage (slashing)");
    expect(weapon.logSource).toBe("Longsword");
    expect(weapon.note).toBeUndefined();
  });

  it("labels a versatile-two-handed weapon with (two-handed) and the upgraded die", () => {
    const character = makeCharacter({
      inventory: [
        weaponItem({
          attackBonus: 4,
          damageDiceCount: 1,
          damageDiceFaces: 8,
          damageModifier: 0,
          damageType: "slashing",
          damage: { damageDiceCount: 1, damageDiceFaces: 10, damageModifier: 2, damageType: "slashing", grip: "versatile-two-handed" },
        }),
      ] as unknown as Character["inventory"],
    });
    const [weapon] = buildAttackEntries(character);
    expect(weapon.damageLabel).toBe("1d10 + 2 slashing (two-handed)");
    expect(weapon.damageSpec).toEqual({ count: 1, faces: 10, modifier: 2 });
  });

  it("renders the unarmed row with a flat display when faces === 1", () => {
    const [unarmed] = buildAttackEntries(makeCharacter());
    expect(unarmed.id).toBe("unarmed");
    expect(unarmed.name).toBe("Unarmed Strike");
    expect(unarmed.attackLabel).toBe("+2");
    expect(unarmed.damageLabel).toBe("1 bludgeoning");
    expect(unarmed.attackSpec).toEqual({ count: 1, faces: 20, modifier: 2 });
    expect(unarmed.attackRollLabel).toBe("Unarmed strike attack");
    expect(unarmed.damageRollLabel).toBe("Unarmed strike damage (bludgeoning)");
    expect(unarmed.logSource).toBe("Unarmed Strike");
    expect(unarmed.magical).toBe(false);
  });

  it("flags the unarmed row magical when the strike is magical (Ki-Empowered Strikes)", () => {
    const character = makeCharacter({
      unarmedStrike: {
        attackBonus: 5,
        magical: true,
        damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" },
      } as unknown as Character["unarmedStrike"],
    });
    const unarmed = buildAttackEntries(character).find((e) => e.id === "unarmed")!;
    expect(unarmed.magical).toBe(true);
  });

  it("signs the improvised attack and notes no proficiency", () => {
    const improvised = buildAttackEntries(makeCharacter()).find((e) => e.id === "improvised")!;
    expect(improvised.id).toBe("improvised");
    expect(improvised.attackLabel).toBe("+2");
    expect(improvised.damageLabel).toBe("1d4 bludgeoning");
    expect(improvised.note).toBe("(no proficiency)");
    expect(improvised.attackRollLabel).toBe("Improvised weapon attack");
    expect(improvised.damageRollLabel).toBe("Improvised weapon damage (bludgeoning)");
    expect(improvised.logSource).toBe("Improvised Weapon");
  });

  it("signs a negative improvised attack bonus and drops the note when proficient", () => {
    const character = makeCharacter({
      improvisedWeapon: {
        attackBonus: -1,
        damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" },
        proficient: true,
      },
    });
    const improvised = buildAttackEntries(character).find((e) => e.id === "improvised")!;
    expect(improvised.attackLabel).toBe("-1");
    expect(improvised.note).toBeUndefined();
  });
});
