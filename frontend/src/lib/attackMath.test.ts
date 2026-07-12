import { describe, it, expect } from "vitest";

import {
  attacksExhausted,
  buildAttackEntries,
  buildEquippedWeaponEntries,
  buildOffHandEntry,
  capabilitiesActive,
  critDamageSpec,
  hasSuperiorityDice,
  unarmedDamageDisplay,
  weaponDamageRiders,
  weaponDamageSpec,
  weaponDamageType,
  weaponGripLabel,
} from "@/lib/attackMath";
import type { Character, InventoryItem, ItemCapability, WeaponDetail } from "@/types/character";

// A dice-valued on-hit damage capability (Flame Tongue +2d6 fire).
function diceCap(overrides: Partial<ItemCapability> = {}): ItemCapability {
  return {
    kind: "passiveBonus",
    target: "damage",
    op: "add",
    dice: { count: 2, faces: 6, damageType: "fire" },
    ...overrides,
  };
}

function invItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "inv-1",
    name: "Flame Tongue",
    category: "weapon",
    quantity: 1,
    equipped: true,
    attuned: true,
    requiresAttunement: true,
    ...overrides,
  } as InventoryItem;
}

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

describe("buildEquippedWeaponEntries", () => {
  it("collapses same-name equipped duplicates into one entry", () => {
    const character = makeCharacter({
      inventory: [
        weaponItem({ attackBonus: 4, damageDiceCount: 1, damageDiceFaces: 4, damageModifier: 2, damageType: "piercing" }, "Dagger", "inv-1"),
        weaponItem({ attackBonus: 4, damageDiceCount: 1, damageDiceFaces: 4, damageModifier: 2, damageType: "piercing" }, "Dagger", "inv-2"),
      ] as unknown as Character["inventory"],
    });
    const entries = buildEquippedWeaponEntries(character);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Dagger");
    expect(entries[0].id).toBe("inv-1");
  });

  it("keeps one entry per distinct weapon name", () => {
    const character = makeCharacter({
      inventory: [
        weaponItem({ attackBonus: 5, damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 3, damageType: "slashing" }, "Longsword", "inv-1"),
        weaponItem({ attackBonus: 4, damageDiceCount: 1, damageDiceFaces: 4, damageModifier: 2, damageType: "piercing" }, "Dagger", "inv-2"),
      ] as unknown as Character["inventory"],
    });
    expect(buildEquippedWeaponEntries(character).map((e) => e.name)).toEqual(["Longsword", "Dagger"]);
  });

  it("excludes unequipped weapons and non-weapons", () => {
    const character = makeCharacter({
      inventory: [
        { ...weaponItem({ attackBonus: 5, damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 3, damageType: "slashing" }, "Longsword", "inv-1"), equipped: false },
      ] as unknown as Character["inventory"],
    });
    expect(buildEquippedWeaponEntries(character)).toEqual([]);
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
          damage: { damageDiceCount: 1, damageDiceFaces: 10, damageModifier: 2, abilityModifier: 2, damageType: "slashing", grip: "versatile-two-handed" },
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

  it("carries a weapon's active dice riders and leaves unarmed/improvised rider-free", () => {
    const weapon = {
      ...invItem({ weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 2, damageType: "slashing", attackBonus: 5 } as WeaponDetail, capabilities: [diceCap()] }),
    };
    const character = makeCharacter({ inventory: [weapon] as unknown as Character["inventory"] });
    const entries = buildAttackEntries(character);
    const flame = entries.find((e) => e.id === "inv-1")!;
    expect(flame.damageRiders).toHaveLength(1);
    expect(flame.damageRiders[0].label).toBe("+2d6 fire");
    expect(entries.find((e) => e.id === "unarmed")!.damageRiders).toEqual([]);
    expect(entries.find((e) => e.id === "improvised")!.damageRiders).toEqual([]);
  });

  it("scopes riders to their own weapon — capabilities on other items don't leak", () => {
    const flame = invItem({
      id: "inv-1",
      name: "Flame Tongue",
      weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", attackBonus: 3 } as WeaponDetail,
      capabilities: [diceCap()],
    });
    const plain = invItem({
      id: "inv-2",
      name: "Dagger",
      requiresAttunement: false,
      attuned: false,
      weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageModifier: 0, damageType: "piercing", attackBonus: 3 } as WeaponDetail,
    });
    const character = makeCharacter({ inventory: [flame, plain] as unknown as Character["inventory"] });
    const entries = buildAttackEntries(character);
    expect(entries.find((e) => e.id === "inv-1")!.damageRiders).toHaveLength(1);
    expect(entries.find((e) => e.id === "inv-2")!.damageRiders).toEqual([]);
  });
});

describe("buildOffHandEntry (#732)", () => {
  // Two equipped weapons: a main-hand and an OFF_HAND shortsword whose damage
  // snapshot carries its ability-mod component (STR +3 folded into damageModifier).
  function twoWeaponChar(overrides: Partial<Character> = {}) {
    const mainHand = {
      ...weaponItem(
        { attackBonus: 5, damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, damageType: "slashing",
          light: true,
          damage: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, abilityModifier: 3, damageType: "slashing", grip: "one-handed" } },
        "Shortsword",
        "main",
      ),
      equippedSlot: "MAIN_HAND" as const,
    };
    const offHand = {
      ...weaponItem(
        { attackBonus: 5, damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, damageType: "piercing",
          light: true,
          damage: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, abilityModifier: 3, damageType: "piercing", grip: "one-handed" } },
        "Dagger",
        "off",
      ),
      equippedSlot: "OFF_HAND" as const,
    };
    return makeCharacter({
      inventory: [mainHand, offHand] as unknown as Character["inventory"],
      ...overrides,
    });
  }

  it("returns null with fewer than two equipped weapons", () => {
    const character = makeCharacter({
      inventory: [weaponItem({ damageModifier: 3, damage: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, abilityModifier: 3, damageType: "slashing", grip: "one-handed" } })] as unknown as Character["inventory"],
    });
    expect(buildOffHandEntry(character)).toBeNull();
  });

  it("scopes to the OFF_HAND weapon", () => {
    const entry = buildOffHandEntry(twoWeaponChar())!;
    expect(entry.id).toBe("off");
    expect(entry.name).toBe("Dagger");
  });

  it("omits the ability modifier from off-hand damage WITHOUT the style", () => {
    const entry = buildOffHandEntry(twoWeaponChar({ resources: { pools: [] } } as unknown as Partial<Character>))!;
    // damageModifier 3 (= STR +3) minus the ability mod → 0.
    expect(entry.damageSpec).toEqual({ count: 1, faces: 6, modifier: 0 });
    expect(entry.damageLabel).toBe("1d6 piercing");
  });

  it("keeps the ability modifier WITH the Two-Weapon Fighting style", () => {
    const entry = buildOffHandEntry(
      twoWeaponChar({ resources: { pools: [], fightingStyle: "twoWeaponFighting" } } as unknown as Partial<Character>),
    )!;
    expect(entry.damageSpec).toEqual({ count: 1, faces: 6, modifier: 3 });
    expect(entry.damageLabel).toBe("1d6 + 3 piercing");
  });

  it("keeps a negative ability modifier even without the style (RAW)", () => {
    const character = makeCharacter({
      inventory: [
        { ...weaponItem({ light: true, damage: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: -1, abilityModifier: -1, damageType: "slashing", grip: "one-handed" } }, "A", "a"), equippedSlot: "MAIN_HAND" as const },
        { ...weaponItem({ light: true, damage: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: -1, abilityModifier: -1, damageType: "piercing", grip: "one-handed" } }, "B", "off"), equippedSlot: "OFF_HAND" as const },
      ] as unknown as Character["inventory"],
    });
    // max(0, -1) = 0 subtracted → the negative mod stays.
    expect(buildOffHandEntry(character)!.damageSpec.modifier).toBe(-1);
  });

  it("shows the full modifier for a legacy weapon whose damage lacks abilityModifier", () => {
    // Pre-#732 serialization: damage present but no ability-mod component.
    const legacyDamage = { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, damageType: "piercing", grip: "one-handed" as const };
    const character = makeCharacter({
      inventory: [
        { ...weaponItem({ light: true, damage: legacyDamage }, "A", "a"), equippedSlot: "MAIN_HAND" as const },
        { ...weaponItem({ light: true, damage: legacyDamage }, "B", "off"), equippedSlot: "OFF_HAND" as const },
      ] as unknown as Character["inventory"],
    });
    // No abilityModifier to subtract → the full modifier is kept (matches pre-#732 behavior).
    expect(buildOffHandEntry(character)!.damageSpec.modifier).toBe(3);
  });

  it("preserves a melee-damage buff (Rage) while dropping only the ability mod", () => {
    // damageModifier 5 = STR +3 folded with a +2 Rage buff; abilityModifier is the raw +3.
    const character = makeCharacter({
      inventory: [
        { ...weaponItem({ light: true, damage: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 5, abilityModifier: 3, damageType: "slashing", grip: "one-handed" } }, "A", "a"), equippedSlot: "MAIN_HAND" as const },
        { ...weaponItem({ light: true, damage: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 5, abilityModifier: 3, damageType: "piercing", grip: "one-handed" } }, "B", "off"), equippedSlot: "OFF_HAND" as const },
      ] as unknown as Character["inventory"],
    });
    // 5 − max(0,3) = 2 (the Rage buff survives).
    expect(buildOffHandEntry(character)!.damageSpec.modifier).toBe(2);
  });
});

describe("capabilitiesActive", () => {
  it("gates an attunement-required item on attunement (not mere equip)", () => {
    expect(capabilitiesActive({ equipped: true, attuned: true, requiresAttunement: true })).toBe(true);
    expect(capabilitiesActive({ equipped: true, attuned: false, requiresAttunement: true })).toBe(false);
  });

  it("gates a non-attunement item on equipped (mirrors backend isItemActive)", () => {
    expect(capabilitiesActive({ equipped: true, attuned: false, requiresAttunement: false })).toBe(true);
    // An unattunable item that is somehow `attuned` is unreachable; the gate does
    // not diverge from the backend by falling back to attunement here.
    expect(capabilitiesActive({ equipped: false, attuned: true, requiresAttunement: false })).toBe(false);
    expect(capabilitiesActive({ equipped: false, attuned: false, requiresAttunement: false })).toBe(false);
  });
});

describe("weaponDamageRiders", () => {
  it("builds a typed +2d6 fire rider from an active dice capability", () => {
    const [rider] = weaponDamageRiders(invItem({ capabilities: [diceCap()] }));
    expect(rider.id).toBe("inv-1:rider:0");
    expect(rider.spec).toEqual({ count: 2, faces: 6, modifier: 0 });
    expect(rider.damageType).toBe("fire");
    expect(rider.label).toBe("+2d6 fire");
    expect(rider.rollLabel).toBe("Flame Tongue: +2d6 fire");
    expect(rider.logSource).toBe("Flame Tongue");
    expect(rider.condition).toBeUndefined();
  });

  it("surfaces a conditional rider's condition as reminder text (never auto-gated)", () => {
    const [rider] = weaponDamageRiders(
      invItem({ name: "Dragon Slayer", capabilities: [diceCap({ dice: { count: 3, faces: 6 }, condition: "vs dragons" })] }),
    );
    expect(rider.label).toBe("+3d6");
    expect(rider.condition).toBe("vs dragons");
  });

  it("removes riders when an attunement-required item is unattuned", () => {
    expect(weaponDamageRiders(invItem({ attuned: false, capabilities: [diceCap()] }))).toEqual([]);
  });

  it("stacks multiple dice capabilities on one weapon", () => {
    const riders = weaponDamageRiders(
      invItem({ capabilities: [diceCap(), diceCap({ dice: { count: 1, faces: 8, damageType: "radiant" } })] }),
    );
    expect(riders.map((r) => r.label)).toEqual(["+2d6 fire", "+1d8 radiant"]);
    expect(riders.map((r) => r.id)).toEqual(["inv-1:rider:0", "inv-1:rider:1"]);
  });

  it("ignores scalar, setTo, and non-damage capabilities", () => {
    expect(
      weaponDamageRiders(
        invItem({
          capabilities: [
            { kind: "passiveBonus", target: "damage", op: "add", value: 2 },
            { kind: "passiveBonus", target: "damage", op: "setTo", dice: { count: 2, faces: 6 } },
            { kind: "passiveBonus", target: "attack", op: "add", dice: { count: 1, faces: 4 } },
            { kind: "castSpell", description: "cast fireball" },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("returns nothing for an item with no capabilities", () => {
    expect(weaponDamageRiders(invItem({ capabilities: undefined }))).toEqual([]);
  });
});

describe("critDamageSpec", () => {
  it("sets crit: true, leaving count and modifier unchanged (rollSpec doubles dice at roll-time)", () => {
    expect(critDamageSpec({ count: 1, faces: 8, modifier: 3 })).toEqual({
      count: 1,
      faces: 8,
      modifier: 3,
      crit: true,
    });
  });

  it("applies the same doubling rule to a damage rider's spec (Flame Tongue +2d6 → +4d6)", () => {
    const rider = weaponDamageRiders(invItem({ capabilities: [diceCap()] }))[0];
    expect(critDamageSpec(rider.spec)).toEqual({
      count: 2,
      faces: 6,
      modifier: 0,
      crit: true,
    });
  });

  it("does not mutate the source spec", () => {
    const spec = { count: 2, faces: 6, modifier: 1 };
    critDamageSpec(spec);
    expect(spec).toEqual({ count: 2, faces: 6, modifier: 1 });
  });
});
