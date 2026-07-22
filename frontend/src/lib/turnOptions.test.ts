/**
 * Unit tests for turnOptions — pure option-card render models.
 * Fixture style mirrors attackMath.test.ts (minimal `as unknown as Character`).
 */

import { describe, expect, it } from "vitest";

import {
  MICRO_CAPTIONS,
  PRIMARY_ACTION_KEYS,
  bonusSpellOptions,
  classActionOption,
  consumableCount,
  mainWeaponSummary,
  moreActionsPreview,
  offHandSummary,
  poolBadgeFor,
  twfHint,
} from "@/lib/turnOptions";
import { resolverFor } from "@/features/session/actionResolvers";
import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import type { AvailableAction, Character, ResourcePool, Spell } from "@/types/character";

function weaponItem(
  overrides: Record<string, unknown> = {},
  weapon: Record<string, unknown> = {},
) {
  return {
    id: "inv-1",
    name: "Longsword",
    category: "weapon",
    quantity: 1,
    equipped: true,
    weapon: {
      attackBonus: 7,
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageModifier: 4,
      damageType: "slashing",
      light: false,
      ...weapon,
    },
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    level: 5,
    inventory: [],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 16,
      charisma: 10,
    },
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

function makeSpell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: "spell-1",
    name: "Healing Word",
    level: 1,
    school: "evocation",
    prepared: true,
    castingTime: "1 bonus action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "",
    effectKind: "heal",
    effectDiceCount: 1,
    effectDiceFaces: 4,
    effectModifier: 0,
    ...overrides,
  } as Spell;
}

describe("mainWeaponSummary", () => {
  it("summarizes the first equipped weapon", () => {
    const c = makeCharacter({ inventory: [weaponItem()] } as Partial<Character>);
    expect(mainWeaponSummary(c)).toBe("Longsword · +7 to hit · 1d8 + 4 slashing");
  });

  it("falls back to Unarmed Strike when nothing is equipped", () => {
    expect(mainWeaponSummary(makeCharacter())).toBe("Unarmed Strike · +2 to hit · 1 bludgeoning");
  });
});

describe("offHandSummary", () => {
  it("summarizes the second equipped weapon", () => {
    const c = makeCharacter({
      inventory: [
        weaponItem({ id: "a", name: "Shortsword" }, { light: true, attackBonus: 5, damageDiceFaces: 6, damageModifier: 3, damageType: "piercing" }),
        weaponItem(
          { id: "b", name: "Dagger" },
          {
            light: true,
            attackBonus: 5,
            damageDiceFaces: 4,
            damageModifier: 3,
            damageType: "piercing",
            damage: { damageDiceCount: 1, damageDiceFaces: 4, damageModifier: 3, damageType: "piercing", grip: "one-handed", abilityModifier: 3 },
          },
        ),
      ],
    } as Partial<Character>);
    // Off-hand drops the +3 ability modifier (no TWF style) → 1d4 piercing.
    expect(offHandSummary(c)).toBe("Dagger (off-hand) · +5 to hit · 1d4 piercing");
  });

  it("returns null when the loadout can't dual-wield", () => {
    expect(offHandSummary(makeCharacter({ inventory: [weaponItem()] } as Partial<Character>))).toBeNull();
  });
});

describe("consumableCount", () => {
  it("sums quantities over consumables only", () => {
    const c = makeCharacter({
      inventory: [
        { id: "p1", name: "Potion of Healing", category: "consumable", quantity: 2 },
        { id: "p2", name: "Antitoxin", category: "consumable", quantity: 1 },
        { id: "g1", name: "Rope", category: "gear", quantity: 5 },
      ],
    } as Partial<Character>);
    expect(consumableCount(c)).toBe(3);
  });

  it("is 0 with no consumables", () => {
    expect(consumableCount(makeCharacter())).toBe(0);
  });
});

describe("poolBadgeFor", () => {
  const pool = (overrides: Partial<ResourcePool>): ResourcePool =>
    ({ key: "secondWind", label: "Second Wind", total: 1, used: 0, remaining: 1, recharge: "shortRest", ...overrides }) as ResourcePool;

  it("shortRest and short-or-long → 'N / rest'", () => {
    expect(poolBadgeFor("secondWind", [pool({})])).toBe("1 / rest");
    expect(poolBadgeFor("secondWind", [pool({ recharge: "short-or-long", remaining: 2 })])).toBe("2 / rest");
  });

  it("longRest → 'N / long rest'", () => {
    expect(poolBadgeFor("secondWind", [pool({ recharge: "longRest" })])).toBe("1 / long rest");
  });

  it("none → '×N'", () => {
    expect(poolBadgeFor("secondWind", [pool({ recharge: "none", remaining: 3 })])).toBe("×3");
  });

  it("undefined when the key or pool is missing", () => {
    expect(poolBadgeFor(undefined, [pool({})])).toBeUndefined();
    expect(poolBadgeFor("focus", [pool({})])).toBeUndefined();
    expect(poolBadgeFor("focus", undefined)).toBeUndefined();
  });
});

describe("classActionOption", () => {
  const available = (overrides: Partial<AvailableAction> = {}): AvailableAction => ({
    key: "secondWind",
    name: "Second Wind",
    cost: "bonusAction",
    enabled: true,
    ...overrides,
  });

  it("derives the heal subtitle + pool badge for Second Wind", () => {
    const c = makeCharacter({
      resources: {
        pools: [{ key: "secondWind", label: "Second Wind", total: 1, used: 0, remaining: 1, recharge: "shortRest" }],
      },
    } as Partial<Character>);
    const option = classActionOption(available(), resolverFor("secondWind"), c);
    expect(option).toMatchObject({
      key: "secondWind",
      title: "Second Wind",
      enabled: true,
      subtitle: "Regain 1d10 + 5 HP",
      badge: "1 / rest",
      heal: true,
    });
  });

  it("plain simple-confirm action → no subtitle, no badge, heal false", () => {
    const c = makeCharacter();
    const option = classActionOption(
      available({ key: "cunningAction", name: "Cunning Action" }),
      resolverFor("cunningAction"),
      c,
    );
    expect(option).toEqual({ key: "cunningAction", title: "Cunning Action", enabled: true, heal: false });
  });

  it("surfaces a reminder action's rule text as the subtitle (#440)", () => {
    const option = classActionOption(
      available({ key: "shadowStep", name: "Shadow Step", cost: "bonusAction", reminder: "Teleport up to 60 ft between dim light or darkness." }),
      resolverFor("shadowStep"),
      makeCharacter(),
    );
    expect(option).toEqual({
      key: "shadowStep",
      title: "Shadow Step",
      enabled: true,
      subtitle: "Teleport up to 60 ft between dim light or darkness.",
      heal: false,
    });
  });

  it("passes through disabled + reason", () => {
    const option = classActionOption(
      available({ enabled: false, disabledReason: "No uses remaining" }),
      resolverFor("secondWind"),
      makeCharacter(),
    );
    expect(option.enabled).toBe(false);
    expect(option.disabledReason).toBe("No uses remaining");
  });

  it("uses the resolver's static subtitle for Bonus Unarmed Strike, not the backend reminder (#1218)", () => {
    const option = classActionOption(
      available({ key: "bonusUnarmedStrike", name: "Bonus Unarmed Strike" }),
      resolverFor("bonusUnarmedStrike"),
      makeCharacter(),
    );
    expect(option).toEqual({
      key: "bonusUnarmedStrike",
      title: "Bonus Unarmed Strike",
      enabled: true,
      subtitle: "One Unarmed Strike as a Bonus Action (Dex + Martial Arts die).",
      heal: false,
    });
  });

  it("passes through the armor/Shield disabledReason for Bonus Unarmed Strike (#1218)", () => {
    const option = classActionOption(
      available({
        key: "bonusUnarmedStrike",
        name: "Bonus Unarmed Strike",
        enabled: false,
        disabledReason: "Requires no armor or Shield",
      }),
      resolverFor("bonusUnarmedStrike"),
      makeCharacter(),
    );
    expect(option.enabled).toBe(false);
    expect(option.disabledReason).toBe("Requires no armor or Shield");
  });
});

describe("bonusSpellOptions", () => {
  const spellcastingCharacter = (spells: Spell[], slots = [{ level: 1, total: 3, used: 1 }]) =>
    makeCharacter({
      spellcasting: {
        ability: "wisdom",
        spellSaveDC: 13,
        spellAttackBonus: 5,
        slots,
        spells,
      },
    } as Partial<Character>);

  it("empty for non-casters", () => {
    expect(bonusSpellOptions(makeCharacter(), {})).toEqual([]);
  });

  it("builds slot badge + effect-preview subtitle for a leveled spell", () => {
    const c = spellcastingCharacter([makeSpell()]);
    expect(bonusSpellOptions(c, {})).toEqual([
      {
        spellId: "spell-1",
        name: "Healing Word",
        subtitle: "Bonus-action cast · 1d4 + 3 healing",
        badge: "L1 slot",
      },
    ]);
  });

  it("cantrips get the 'at will' badge", () => {
    const c = spellcastingCharacter([
      makeSpell({ id: "s0", name: "Shillelagh", level: 0, effectKind: null, effectDiceCount: null, effectDiceFaces: null }),
    ]);
    expect(bonusSpellOptions(c, {})).toEqual([
      { spellId: "s0", name: "Shillelagh", subtitle: "Bonus-action cast", badge: "at will" },
    ]);
  });

  it("excludes spells that are not bonus-action or have no affordable slot", () => {
    const c = spellcastingCharacter(
      [
        makeSpell({ id: "s-action", name: "Cure Wounds", castingTime: "1 action" }),
        makeSpell({ id: "s-l2", name: "Spiritual Weapon", level: 2 }),
      ],
      [{ level: 1, total: 3, used: 1 }], // no L2 slot
    );
    expect(bonusSpellOptions(c, {})).toEqual([]);
  });

  it("respects the 5e interlock: leveled action-spell blocks bonus-action casting", () => {
    const c = spellcastingCharacter([makeSpell()]);
    expect(bonusSpellOptions(c, { action: "leveled" })).toEqual([]);
  });
});

describe("twfHint", () => {
  it("null when TWF is already available", () => {
    const c = makeCharacter({
      inventory: [
        weaponItem({ id: "a", name: "Shortsword" }, { light: true }),
        weaponItem({ id: "b", name: "Shortsword" }, { light: true }),
      ],
    } as Partial<Character>);
    expect(twfHint(c)).toBeNull();
  });

  it("names a same-name owned pair", () => {
    const c = makeCharacter({
      inventory: [
        weaponItem({ id: "a", name: "Shortsword", equipped: false }, { light: true }),
        weaponItem({ id: "b", name: "Shortsword", equipped: false }, { light: true }),
      ],
    } as Partial<Character>);
    expect(twfHint(c)).toBe(
      "Off-hand attack needs two light weapons — equip Two Shortswords to enable it.",
    );
  });

  it("names a mixed owned pair", () => {
    const c = makeCharacter({
      inventory: [
        weaponItem({ id: "a", name: "Shortsword", equipped: false }, { light: true }),
        weaponItem({ id: "b", name: "Dagger", equipped: false }, { light: true }),
      ],
    } as Partial<Character>);
    expect(twfHint(c)).toBe(
      "Off-hand attack needs two light weapons — equip Shortsword & Dagger to enable it.",
    );
  });

  it("does not naively pluralize an s-ending weapon name", () => {
    const c = makeCharacter({
      inventory: [
        weaponItem({ id: "a", name: "Cutlass", equipped: false }, { light: true }),
        weaponItem({ id: "b", name: "Cutlass", equipped: false }, { light: true }),
      ],
    } as Partial<Character>);
    expect(twfHint(c)).toBe(
      "Off-hand attack needs two light weapons — equip a pair of Cutlass to enable it.",
    );
  });

  it("generic fallback when fewer than two light weapons are owned", () => {
    const c = makeCharacter({ inventory: [weaponItem()] } as Partial<Character>);
    expect(twfHint(c)).toBe("Off-hand attack needs two light weapons equipped.");
  });
});

describe("more-actions helpers", () => {
  it("every non-primary universal action has a micro-caption", () => {
    const nonPrimary = UNIVERSAL_ACTIONS.filter(
      (a) => a.cost === "action" && !PRIMARY_ACTION_KEYS.has(a.key),
    );
    for (const a of nonPrimary) {
      expect(MICRO_CAPTIONS[a.key], `missing caption for ${a.key}`).toBeTruthy();
    }
  });

  it("moreActionsPreview joins labels with dots", () => {
    expect(
      moreActionsPreview([
        { key: "disengage", label: "Disengage", cost: "action", description: "" },
        { key: "hide", label: "Hide", cost: "action", description: "" },
      ]),
    ).toBe("Disengage · Hide");
  });
});
