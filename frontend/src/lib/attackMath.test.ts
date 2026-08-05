// attackMath is a formatter over the served `character.attackRows` (#1434): these
// tests feed it rows in the exact shape serializeCharacter emits and assert the
// label strings and row selection. There is deliberately no attack arithmetic to
// test here any more — the specs are inputs, and the rules that produce them are
// covered by backend off-hand-damage.test.ts / character-serialize-attack-rows.test.ts.

import { describe, it, expect } from "vitest";

import {
  attacksExhausted,
  buildAttackEntries,
  buildAttackForms,
  buildBonusSwingEntry,
  buildOffHandEntry,
  buildUnarmedOnlyForms,
  critDamageSpec,
  flurryStrikeCount,
  hasSuperiorityDice,
  unarmedDamageDisplay,
  weaponGripLabel,
} from "@/lib/attackMath";
import type { Character } from "@/types/character";
import type { AttackRow } from "@character-sheet/shared-types";

function weaponRow(overrides: Partial<AttackRow> = {}): AttackRow {
  return {
    id: "inv-1",
    kind: "weapon",
    name: "Longsword",
    attackSpec: { count: 1, faces: 20, modifier: 5 },
    damageSpec: { count: 1, faces: 8, modifier: 3 },
    damageType: "slashing",
    grip: "one-handed",
    magical: false,
    offHand: false,
    damageRiders: [],
    attackComponents: { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0 },
    damageComponents: { abilityMod: 3, meleeDamageBonus: 0 },
    ...overrides,
  };
}

const UNARMED_ROW: AttackRow = {
  id: "unarmed",
  kind: "unarmed",
  name: "Unarmed Strike",
  attackSpec: { count: 1, faces: 20, modifier: 2 },
  damageSpec: { count: 1, faces: 1, modifier: 0 },
  damageType: "bludgeoning",
  magical: false,
  offHand: false,
  damageRiders: [],
};

const IMPROVISED_ROW: AttackRow = {
  id: "improvised",
  kind: "improvised",
  name: "Improvised Weapon",
  attackSpec: { count: 1, faces: 20, modifier: 2 },
  damageSpec: { count: 1, faces: 4, modifier: 0 },
  damageType: "bludgeoning",
  magical: false,
  offHand: false,
  damageRiders: [],
};

/** A Flame Tongue rider exactly as the serializer emits it. */
const FIRE_RIDER = {
  id: "inv-1:rider:0",
  spec: { count: 2, faces: 6, modifier: 0 },
  damageType: "fire",
};

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    // classEntryLevel's single-class fallback needs a class to match against
    // (#1441) — inert for every other test in this file.
    class: "Monk",
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
    attackRows: [UNARMED_ROW, IMPROVISED_ROW],
    resources: { pools: [] },
    advancements: [],
    ...overrides,
  } as unknown as Character;
}

/** A character whose served rows are `weapons` followed by unarmed + improvised. */
function withWeapons(weapons: AttackRow[], overrides: Partial<Character> = {}): Character {
  return makeCharacter({ attackRows: [...weapons, UNARMED_ROW, IMPROVISED_ROW], ...overrides });
}

describe("weaponGripLabel", () => {
  it("labels two-handed grips and stays silent otherwise", () => {
    expect(weaponGripLabel("versatile-two-handed")).toBe(" (two-handed)");
    expect(weaponGripLabel("two-handed")).toBe(" (two-handed)");
    expect(weaponGripLabel("one-handed")).toBe("");
    // Unarmed/improvised rows carry no grip.
    expect(weaponGripLabel(undefined)).toBe("");
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
  it("keeps the served order: equipped weapons, then unarmed, then improvised", () => {
    const entries = buildAttackEntries(withWeapons([weaponRow()]));
    expect(entries.map((e) => e.id)).toEqual(["inv-1", "unarmed", "improvised"]);
  });

  it("emits exact roll-source and log-source strings for a weapon", () => {
    const [weapon] = buildAttackEntries(withWeapons([weaponRow()]));
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

  it("forwards the row's decomposed attack/damage components untouched (#1235)", () => {
    const [weapon] = buildAttackEntries(withWeapons([weaponRow({ damageComponents: { abilityMod: 3, meleeDamageBonus: 2 } })]));
    expect(weapon.attackComponents).toEqual({ abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0 });
    expect(weapon.damageComponents).toEqual({ abilityMod: 3, meleeDamageBonus: 2 });
  });

  it("labels a versatile-two-handed weapon with (two-handed) and shows its served die", () => {
    const [weapon] = buildAttackEntries(
      withWeapons([weaponRow({ damageSpec: { count: 1, faces: 10, modifier: 2 }, grip: "versatile-two-handed" })]),
    );
    expect(weapon.damageLabel).toBe("1d10 + 2 slashing (two-handed)");
    expect(weapon.damageSpec).toEqual({ count: 1, faces: 10, modifier: 2 });
  });

  it("renders the unarmed row with a flat display when faces === 1", () => {
    const unarmed = buildAttackEntries(makeCharacter()).find((e) => e.id === "unarmed")!;
    expect(unarmed.name).toBe("Unarmed Strike");
    expect(unarmed.attackLabel).toBe("+2");
    expect(unarmed.damageLabel).toBe("1 bludgeoning");
    expect(unarmed.attackSpec).toEqual({ count: 1, faces: 20, modifier: 2 });
    expect(unarmed.attackRollLabel).toBe("Unarmed strike attack");
    expect(unarmed.damageRollLabel).toBe("Unarmed strike damage (bludgeoning)");
    expect(unarmed.logSource).toBe("Unarmed Strike");
    expect(unarmed.magical).toBe(false);
  });

  it("flags the unarmed row magical when the served row is (Empowered Strikes)", () => {
    const character = makeCharacter({
      unarmedStrike: {
        attackBonus: 5,
        magical: true,
        damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" },
      } as unknown as Character["unarmedStrike"],
      attackRows: [
        { ...UNARMED_ROW, magical: true, attackSpec: { count: 1, faces: 20, modifier: 5 }, damageSpec: { count: 1, faces: 8, modifier: 3 } },
        IMPROVISED_ROW,
      ],
    });
    const unarmed = buildAttackEntries(character).find((e) => e.id === "unarmed")!;
    expect(unarmed.magical).toBe(true);
    expect(unarmed.damageLabel).toBe("1d8 + 3 bludgeoning");
  });

  it("signs the improvised attack and notes no proficiency", () => {
    const improvised = buildAttackEntries(makeCharacter()).find((e) => e.id === "improvised")!;
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
      attackRows: [UNARMED_ROW, { ...IMPROVISED_ROW, attackSpec: { count: 1, faces: 20, modifier: -1 } }],
    });
    const improvised = buildAttackEntries(character).find((e) => e.id === "improvised")!;
    expect(improvised.attackLabel).toBe("-1");
    expect(improvised.note).toBeUndefined();
  });

  it("decorates a served dice rider with its chip/roll/log strings", () => {
    const entries = buildAttackEntries(
      withWeapons([weaponRow({ name: "Flame Tongue", damageRiders: [FIRE_RIDER] })]),
    );
    const [rider] = entries[0].damageRiders;
    expect(rider.id).toBe("inv-1:rider:0");
    expect(rider.spec).toEqual({ count: 2, faces: 6, modifier: 0 });
    expect(rider.damageType).toBe("fire");
    expect(rider.label).toBe("+2d6 fire");
    expect(rider.rollLabel).toBe("Flame Tongue: +2d6 fire");
    expect(rider.logSource).toBe("Flame Tongue");
    expect(rider.condition).toBeUndefined();
  });

  it("labels an untyped rider without a damage type and surfaces its condition as reminder text", () => {
    const entries = buildAttackEntries(
      withWeapons([
        weaponRow({
          name: "Dragon Slayer",
          damageRiders: [{ id: "inv-1:rider:0", spec: { count: 3, faces: 6, modifier: 0 }, condition: "vs dragons" }],
        }),
      ]),
    );
    expect(entries[0].damageRiders[0].label).toBe("+3d6");
    expect(entries[0].damageRiders[0].condition).toBe("vs dragons");
  });

  it("carries each row's own riders and leaves unarmed/improvised rider-free", () => {
    const entries = buildAttackEntries(
      withWeapons([
        weaponRow({ id: "inv-1", name: "Flame Tongue", damageRiders: [FIRE_RIDER] }),
        weaponRow({ id: "inv-2", name: "Dagger" }),
      ]),
    );
    expect(entries.find((e) => e.id === "inv-1")!.damageRiders).toHaveLength(1);
    expect(entries.find((e) => e.id === "inv-2")!.damageRiders).toEqual([]);
    expect(entries.find((e) => e.id === "unarmed")!.damageRiders).toEqual([]);
    expect(entries.find((e) => e.id === "improvised")!.damageRiders).toEqual([]);
  });

  it("excludes the off-hand row — it belongs to the bonus action and shares its weapon's id", () => {
    const character = withWeapons([
      weaponRow({ id: "off", name: "Dagger" }),
      weaponRow({ id: "off", name: "Dagger", offHand: true, damageSpec: { count: 1, faces: 4, modifier: 0 } }),
    ]);
    expect(buildAttackEntries(character).map((e) => e.id)).toEqual(["off", "unarmed", "improvised"]);
  });
});

describe("buildAttackForms (#786)", () => {
  it("dedupes equipped weapons by name, then appends Unarmed then Improvised", () => {
    const forms = buildAttackForms(
      withWeapons([weaponRow({ id: "inv-1", name: "Dagger" }), weaponRow({ id: "inv-2", name: "Dagger" })]),
    );
    expect(forms.map((f) => f.name)).toEqual(["Dagger", "Unarmed Strike", "Improvised Weapon"]);
    // First occurrence wins, so its snapshot drives the card.
    expect(forms[0].id).toBe("inv-1");
  });

  it("keeps one form per distinct weapon name", () => {
    const forms = buildAttackForms(
      withWeapons([weaponRow({ id: "inv-1", name: "Longsword" }), weaponRow({ id: "inv-2", name: "Dagger" })]),
    );
    expect(forms.map((f) => f.name)).toEqual(["Longsword", "Dagger", "Unarmed Strike", "Improvised Weapon"]);
  });

  it("defaults to Unarmed as the first form when no weapon is equipped", () => {
    const forms = buildAttackForms(makeCharacter());
    expect(forms.map((f) => f.id)).toEqual(["unarmed", "improvised"]);
    expect(forms[0].name).toBe("Unarmed Strike");
  });

  it("puts the main-hand weapon first so it is the default selection", () => {
    expect(buildAttackForms(withWeapons([weaponRow()]))[0].name).toBe("Longsword");
  });

  // The off-hand row shares its weapon's id, so leaking it into the forms list
  // would give the segmented selector two options with the same id (#1434).
  it("never offers the off-hand row as a form", () => {
    const forms = buildAttackForms(
      withWeapons([
        weaponRow({ id: "off", name: "Dagger" }),
        weaponRow({ id: "off", name: "Dagger", offHand: true }),
      ]),
    );
    expect(forms.map((f) => f.name)).toEqual(["Dagger", "Unarmed Strike", "Improvised Weapon"]);
  });
});

describe("buildUnarmedOnlyForms (#1217)", () => {
  it("returns exactly one form — Unarmed Strike — even with weapons equipped", () => {
    const forms = buildUnarmedOnlyForms(withWeapons([weaponRow({ name: "Shortsword" })]));
    expect(forms).toHaveLength(1);
    expect(forms[0].id).toBe("unarmed");
    expect(forms[0].name).toBe("Unarmed Strike");
  });

  it("never includes Improvised Weapon (2024 Flurry grants no weapon choice)", () => {
    expect(buildUnarmedOnlyForms(makeCharacter()).some((f) => f.id === "improvised")).toBe(false);
  });

  // Guards the fixture trap: a payload without its unarmed row must fail loudly
  // rather than render an empty picker.
  it("throws rather than returning nothing when the unarmed row is missing", () => {
    expect(() => buildUnarmedOnlyForms(makeCharacter({ attackRows: [] }))).toThrow(/no unarmed attack row/);
  });
});

// The strike count is resolved server-side now (#1505) onto the served
// flurryOfBlows row's `count` — these pin that the function reads the wire
// value verbatim rather than re-deriving Heightened Focus from a level.
function flurryOfBlowsAction(count: number) {
  return [{ key: "flurryOfBlows", name: "Flurry of Blows", cost: "bonusAction", enabled: true, count }];
}

describe("flurryStrikeCount (#1217, Heightened Focus upgrade #1244)", () => {
  it("reads the served count — 2 below monk L10", () => {
    expect(flurryStrikeCount(makeCharacter({ availableActions: flurryOfBlowsAction(2) } as unknown as Partial<Character>))).toBe(2);
  });

  it("reads the served count — 3 at monk L10+ (Heightened Focus)", () => {
    expect(flurryStrikeCount(makeCharacter({ availableActions: flurryOfBlowsAction(3) } as unknown as Partial<Character>))).toBe(3);
  });

  it("falls back to 2 (every edition's floor) when the row hasn't loaded yet", () => {
    expect(flurryStrikeCount(makeCharacter({ availableActions: [] } as unknown as Partial<Character>))).toBe(2);
  });

  it("never re-derives the count from monk level — a stale/absent level does not change the served value", () => {
    const character = makeCharacter({
      level: 20,
      classes: [{ name: "Monk", level: 20 }],
      availableActions: flurryOfBlowsAction(2),
    } as unknown as Partial<Character>);
    // A 2014 monk at L20 has no three-strike upgrade at all — the server
    // would serve 2 here regardless of level, and the client must not
    // second-guess it with its own >= 10 threshold.
    expect(flurryStrikeCount(character)).toBe(2);
  });
});

describe("buildOffHandEntry (#732)", () => {
  // The served pair: a main-hand Shortsword at +3 damage and the off-hand row the
  // server already reduced to +0 (its ability mod dropped).
  function twoWeaponRows(offHandOverrides: Partial<AttackRow> = {}): AttackRow[] {
    return [
      weaponRow({ id: "main", name: "Shortsword", damageSpec: { count: 1, faces: 6, modifier: 3 }, damageType: "piercing" }),
      weaponRow({ id: "off", name: "Dagger", damageSpec: { count: 1, faces: 6, modifier: 3 }, damageType: "piercing" }),
      weaponRow({
        id: "off",
        name: "Dagger",
        offHand: true,
        damageType: "piercing",
        damageSpec: { count: 1, faces: 6, modifier: 0 },
        damageComponents: { abilityMod: 0, meleeDamageBonus: 0 },
        ...offHandOverrides,
      }),
    ];
  }

  it("returns null when the server served no off-hand row", () => {
    expect(buildOffHandEntry(withWeapons([weaponRow()]))).toBeNull();
  });

  it("suffixes only the display name, keeping the off-hand weapon's own id", () => {
    const entry = buildOffHandEntry(withWeapons(twoWeaponRows()))!;
    expect(entry.id).toBe("off");
    expect(entry.name).toBe("Dagger (off-hand)");
  });

  it("keeps the weapon's own name on the roll and log labels, not the suffixed one", () => {
    const entry = buildOffHandEntry(withWeapons(twoWeaponRows()))!;
    expect(entry.attackRollLabel).toBe("Dagger attack");
    expect(entry.damageRollLabel).toBe("Dagger damage (piercing)");
    expect(entry.logSource).toBe("Dagger");
  });

  it("labels the reduced damage the server served, without recomputing it", () => {
    const entry = buildOffHandEntry(withWeapons(twoWeaponRows()))!;
    expect(entry.damageSpec).toEqual({ count: 1, faces: 6, modifier: 0 });
    expect(entry.damageLabel).toBe("1d6 piercing");
    expect(entry.damageComponents).toEqual({ abilityMod: 0, meleeDamageBonus: 0 });
  });

  it("labels the full damage when the served row kept its ability modifier (TWF style)", () => {
    const entry = buildOffHandEntry(
      withWeapons(
        twoWeaponRows({
          damageSpec: { count: 1, faces: 6, modifier: 3 },
          damageComponents: { abilityMod: 3, meleeDamageBonus: 0 },
        }),
      ),
    )!;
    expect(entry.damageLabel).toBe("1d6 + 3 piercing");
    expect(entry.damageComponents).toEqual({ abilityMod: 3, meleeDamageBonus: 0 });
  });

  it("labels a negative served modifier with a dash", () => {
    const entry = buildOffHandEntry(
      withWeapons(twoWeaponRows({ damageSpec: { count: 1, faces: 6, modifier: -1 } })),
    )!;
    expect(entry.damageLabel).toBe("1d6 - 1 piercing");
  });

  it("decorates the off-hand row's riders under the weapon's own name", () => {
    const entry = buildOffHandEntry(
      withWeapons(twoWeaponRows({ name: "Flame Tongue", damageRiders: [FIRE_RIDER] })),
    )!;
    expect(entry.damageRiders[0].rollLabel).toBe("Flame Tongue: +2d6 fire");
    expect(entry.damageRiders[0].logSource).toBe("Flame Tongue");
  });
});

describe("buildBonusSwingEntry", () => {
  it('returns the off-hand entry for "twf"', () => {
    const character = withWeapons([
      weaponRow({ id: "off", name: "Dagger" }),
      weaponRow({ id: "off", name: "Dagger", offHand: true }),
    ]);
    expect(buildBonusSwingEntry(character, "twf")!.name).toBe("Dagger (off-hand)");
  });

  it('returns the Unarmed Strike entry for "unarmed" even with weapons equipped', () => {
    const character = withWeapons([weaponRow()]);
    expect(buildBonusSwingEntry(character, "unarmed")!.id).toBe("unarmed");
  });

  it('is null for "twf" when no off-hand row was served', () => {
    expect(buildBonusSwingEntry(withWeapons([weaponRow()]), "twf")).toBeNull();
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
    const entries = buildAttackEntries(withWeapons([weaponRow({ damageRiders: [FIRE_RIDER] })]));
    expect(critDamageSpec(entries[0].damageRiders[0].spec)).toEqual({
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
