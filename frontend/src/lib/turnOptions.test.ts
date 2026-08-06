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
  partitionClassActions,
  poolBadgeFor,
  twfHint,
} from "@/lib/turnOptions";
import { resolverFor } from "@/features/session/actionResolvers";
import { IMPROVISED_ROW, UNARMED_ROW, attackRow } from "@/test/attackRowFixtures";
import { SERVED_ACTIONS_2014, SERVED_ACTIONS_2024 } from "@/test/universalActions";
import type { AttackRow } from "@character-sheet/shared-types";
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

// mainWeaponSummary/offHandSummary read `character.attackRows` (#1434), so
// `weaponRows` states the weapon rows the server would have served; the two
// always-present rows are appended.
function makeCharacter(overrides: Partial<Character> = {}, weaponRows: AttackRow[] = []): Character {
  const base = {
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
  return {
    ...base,
    attackRows: overrides.attackRows ?? [...weaponRows, UNARMED_ROW, IMPROVISED_ROW],
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
    // #1381: effectPreview is a lookup into the served effectRolls now, not a
    // re-derivation from raw columns — the fixture must carry the resolved roll.
    effectRolls: [{ slotLevel: 1, roll: { count: 1, faces: 4, modifier: 3 } }],
    ...overrides,
  } as Spell;
}

/** The served row for a weapon fixture, at whatever numbers the test cares about. */
function weaponRow(over: Partial<AttackRow> & Pick<AttackRow, "id" | "name">): AttackRow {
  return attackRow({ kind: "weapon", grip: "one-handed", damageType: "slashing", ...over });
}

describe("mainWeaponSummary", () => {
  it("summarizes the first equipped weapon", () => {
    const c = makeCharacter({ inventory: [weaponItem()] } as Partial<Character>, [
      weaponRow({
        id: "inv-1",
        name: "Longsword",
        attackSpec: { count: 1, faces: 20, modifier: 7 },
        damageSpec: { count: 1, faces: 8, modifier: 4 },
      }),
    ]);
    expect(mainWeaponSummary(c)).toBe("Longsword · +7 to hit · 1d8 + 4 slashing");
  });

  it("falls back to Unarmed Strike when nothing is equipped", () => {
    expect(mainWeaponSummary(makeCharacter())).toBe("Unarmed Strike · +2 to hit · 1 bludgeoning");
  });
});

describe("offHandSummary", () => {
  it("summarizes the served off-hand row", () => {
    const dagger = { id: "b", name: "Dagger", damageType: "piercing", attackSpec: { count: 1, faces: 20, modifier: 5 } };
    const c = makeCharacter({}, [
      weaponRow({
        id: "a",
        name: "Shortsword",
        damageType: "piercing",
        attackSpec: { count: 1, faces: 20, modifier: 5 },
        damageSpec: { count: 1, faces: 6, modifier: 3 },
      }),
      weaponRow({ ...dagger, damageSpec: { count: 1, faces: 4, modifier: 3 } }),
      // The server already dropped the +3 ability modifier (no TWF style), and the
      // off-hand row shares its weapon's id.
      weaponRow({ ...dagger, offHand: true, damageSpec: { count: 1, faces: 4, modifier: 0 } }),
    ]);
    expect(offHandSummary(c)).toBe("Dagger (off-hand) · +5 to hit · 1d4 piercing");
  });

  it("returns null when no off-hand row was served", () => {
    expect(offHandSummary(makeCharacter({}, [weaponRow({ id: "inv-1", name: "Longsword" })]))).toBeNull();
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

  it("derives the heal subtitle + pool badge for Second Wind (#1528: row-driven fallback resolver, server-computed reminder)", () => {
    const c = makeCharacter({
      resources: {
        pools: [{ key: "secondWind", label: "Second Wind", total: 1, used: 0, remaining: 1, recharge: "shortRest" }],
      },
    } as Partial<Character>);
    const action = available({ resolverKind: "heal-roll", reminder: "Regain 1d10 + 5 HP" });
    const option = classActionOption(action, resolverFor("secondWind", action), c, []);
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
      // Served rows present but the action regrants nothing — nothing may leak
      // onto a row that declared no grant (#1431).
      SERVED_ACTIONS_2014,
    );
    expect(option).toEqual({ key: "cunningAction", title: "Cunning Action", enabled: true, heal: false });
  });

  it("surfaces a reminder action's rule text as the subtitle (#440)", () => {
    const option = classActionOption(
      available({ key: "shadowStep", name: "Shadow Step", cost: "bonusAction", reminder: "Teleport up to 60 ft between dim light or darkness." }),
      resolverFor("shadowStep"),
      makeCharacter(),
      [],
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
      [],
    );
    expect(option.enabled).toBe(false);
    expect(option.disabledReason).toBe("No uses remaining");
  });

  it("uses the resolver's static subtitle for Bonus Unarmed Strike, not the backend reminder (#1218)", () => {
    const option = classActionOption(
      available({ key: "bonusUnarmedStrike", name: "Bonus Unarmed Strike" }),
      resolverFor("bonusUnarmedStrike"),
      makeCharacter(),
      [],
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
      [],
    );
    expect(option.enabled).toBe(false);
    expect(option.disabledReason).toBe("Requires no armor or Shield");
  });
  it("surfaces Flurry of Blows' 1-Focus spend as the subtitle, not just the remaining-pool badge (#1217)", () => {
    const c = makeCharacter({
      resources: {
        pools: [{ key: "focus", label: "Focus Points", total: 3, used: 0, remaining: 3, recharge: "short-or-long" }],
      },
    } as Partial<Character>);
    const option = classActionOption(
      available({ key: "flurryOfBlows", name: "Flurry of Blows" }),
      resolverFor("flurryOfBlows"),
      c,
      [],
    );
    expect(option).toMatchObject({
      subtitle: "Spend 1 Focus Points",
      badge: "3 / rest",
    });
  });

  it("surfaces Flurry of Blows' 1-ki spend as the subtitle for a 2014 monk (#1500) — the served action carries no resourceKey to fork on", () => {
    const c = makeCharacter({
      resources: {
        pools: [{ key: "ki", label: "Ki Points", total: 5, used: 0, remaining: 5, recharge: "short-or-long" }],
      },
    } as Partial<Character>);
    const option = classActionOption(
      available({ key: "flurryOfBlows", name: "Flurry of Blows" }),
      resolverFor("flurryOfBlows"),
      c,
      [],
    );
    expect(option).toMatchObject({
      subtitle: "Spend 1 Ki Points",
      badge: "5 / rest",
    });
  });

  // #1431. Names, never the served `description`: OptionCard's subtitle is one
  // truncated line and the served paragraphs run 75-278 chars.
  it("resolves regranted keys to the served names for the character's edition", () => {
    const cunning = available({
      key: "cunningAction",
      name: "Cunning Action",
      regrants: ["dash", "disengage", "hide"],
    });
    expect(
      classActionOption(cunning, resolverFor("cunningAction"), makeCharacter(), SERVED_ACTIONS_2014).regrantNames,
    ).toEqual(["Dash", "Disengage", "Hide"]);
  });

  it("resolves the SAME key to each edition's own name (Use an Object / Utilize)", () => {
    const fastHands = available({ key: "fastHands", name: "Fast Hands", regrants: ["useObject"] });
    const namesFor = (served: typeof SERVED_ACTIONS_2014) =>
      classActionOption(fastHands, resolverFor("fastHands"), makeCharacter(), served).regrantNames;
    expect(namesFor(SERVED_ACTIONS_2014)).toEqual(["Use an Object"]);
    expect(namesFor(SERVED_ACTIONS_2024)).toEqual(["Utilize"]);
  });

  it("drops keys the served list doesn't cover, and omits the field when none resolve", () => {
    const partial = available({ key: "cunningAction", name: "Cunning Action", regrants: ["dash", "notAnAction"] });
    expect(
      classActionOption(partial, resolverFor("cunningAction"), makeCharacter(), SERVED_ACTIONS_2024).regrantNames,
    ).toEqual(["Dash"]);
    // The empty case is first paint, before the reference query resolves — the
    // card must render with no subtitle rather than an empty one.
    expect(
      classActionOption(partial, resolverFor("cunningAction"), makeCharacter(), []),
    ).not.toHaveProperty("regrantNames");
  });

  it("leaves a regranting row's own reminder as the subtitle (the monk-card latch)", () => {
    const patientDefense = available({
      key: "patientDefense",
      name: "Patient Defense",
      regrants: ["disengage"],
      reminder: "Disengage (free bonus action).",
    });
    const option = classActionOption(
      patientDefense,
      resolverFor("patientDefense"),
      makeCharacter(),
      SERVED_ACTIONS_2024,
    );
    expect(option.subtitle).toBe("Disengage (free bonus action).");
    expect(option.regrantNames).toEqual(["Disengage"]);
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

  // The user-visible consequence of #1496: a non-light pair plus the style used to
  // suppress the hint entirely (TWF read as live); now the requirement is stated.
  it("still hints for a non-light pair held by a character with the Two-Weapon Fighting style", () => {
    const c = makeCharacter({
      inventory: [weaponItem({ id: "a" }), weaponItem({ id: "b" })],
      advancements: [
        { id: "fs1", slot: "fightingStyle", improvements: [{ target: "offhandAbilityDamage", amount: 1 }] },
      ],
    } as unknown as Partial<Character>);
    expect(twfHint(c)).toBe("Off-hand attack needs two light weapons equipped.");
  });
});

describe("partitionClassActions", () => {
  // resolverKind (#1528, optional 4th arg) — a row-driven action (secondWind)
  // is only reachable through resolverFor's fallback when the served row
  // actually carries it; every other call site below deliberately omits it
  // (shadowArts/cloakOfShadows/elementalBurst have none in production either).
  const action = (key: string, cost: AvailableAction["cost"], resolverKind?: string): AvailableAction => ({
    key,
    name: key,
    cost,
    enabled: true,
    ...(resolverKind ? { resolverKind } : {}),
  });

  // #1315: shadowArts/cloakOfShadows/elementalBurst are cost:"action"
  // DERIVED_ACTIONS rows with NO frontend resolver — they cast through their
  // own dedicated /abilities/shadow-arts and /abilities/warrior-of-elements
  // endpoints + Class-tab sections (ShadowArtsSection/CloakOfShadowsSection/
  // WarriorOfElementsSection), not the generic turn-hub dispatch. Before this
  // fix they still reached classActions and rendered a clickable card:
  // planActionClick's no-resolver fallback is {consumeSlot:true, send:"none"}
  // — clicking it would burn the character's Action and do nothing (no focus
  // spent, no cast, no invisibility). partitionClassActions must drop any
  // action with no resolver instead of letting it through.
  it("drops action-cost rows with no resolver instead of letting them consume the slot", () => {
    const { classActions } = partitionClassActions(
      [action("secondWind", "action", "heal-roll"), action("shadowArts", "action"), action("cloakOfShadows", "action"), action("elementalBurst", "action")],
      false,
    );
    const keys = classActions.map((a) => a.key);
    expect(keys).toEqual(["secondWind"]);
  });

  it("invariant: every key in every partition has a registered resolver (never consumes a slot for nothing)", () => {
    const availableActions = [
      action("secondWind", "action"),
      action("shadowArts", "action"),
      action("cloakOfShadows", "action"),
      action("elementalBurst", "action"),
      action("bardicInspiration", "bonusAction"),
      action("deflectAttacks", "reaction"),
    ];
    const { classActions, classBonusActions, classReactions } = partitionClassActions(availableActions, false);
    for (const a of [...classActions, ...classBonusActions, ...classReactions]) {
      expect(resolverFor(a.key), `${a.key} has no resolver but reached a turn-hub partition`).toBeDefined();
    }
  });

  it("still swaps rage/endRage by the raging flag (unchanged behavior)", () => {
    // rage/endRage are row-driven now (#1686) — no ACTION_RESOLVERS entry, so
    // the served action needs its own resolverKind ("toggle") for
    // resolverFor's fallback to resolve it, same as secondWind above.
    const availableActions = [action("rage", "bonusAction", "toggle"), action("endRage", "bonusAction", "toggle")];
    expect(partitionClassActions(availableActions, false).classBonusActions.map((a) => a.key)).toEqual(["rage"]);
    expect(partitionClassActions(availableActions, true).classBonusActions.map((a) => a.key)).toEqual(["endRage"]);
  });

  it("partitions by cost (action/bonusAction/reaction) same as before", () => {
    const availableActions = [action("secondWind", "bonusAction", "heal-roll"), action("deflectAttacks", "reaction"), action("cunningAction", "bonusAction")];
    const { classActions, classBonusActions, classReactions } = partitionClassActions(availableActions, false);
    expect(classActions).toEqual([]);
    expect(classBonusActions.map((a) => a.key)).toEqual(["secondWind", "cunningAction"]);
    expect(classReactions.map((a) => a.key)).toEqual(["deflectAttacks"]);
  });
});

describe("more-actions helpers", () => {
  // Asserted against the SERVED row shape, per edition: the captions are keyed
  // on the edition-stable `key`, so a 2024-only addition (study/influence) that
  // never got one would ship a tile with no caption.
  it.each([
    ["2014", SERVED_ACTIONS_2014],
    ["2024", SERVED_ACTIONS_2024],
  ])("every non-primary universal action served for %s has a micro-caption", (_edition, served) => {
    const nonPrimary = served.filter((a) => a.cost === "action" && !PRIMARY_ACTION_KEYS.has(a.key));
    expect(nonPrimary.length).toBeGreaterThan(0);
    for (const a of nonPrimary) {
      expect(MICRO_CAPTIONS[a.key], `missing caption for ${a.key}`).toBeTruthy();
    }
  });

  // PRIMARY_ACTION_KEYS partitions the served list: each primary key must exist
  // in BOTH editions, or one edition would silently lose a rich card.
  it.each([
    ["2014", SERVED_ACTIONS_2014],
    ["2024", SERVED_ACTIONS_2024],
  ])("every primary action key is served for %s", (_edition, served) => {
    const servedKeys = new Set(served.map((a) => a.key));
    for (const key of PRIMARY_ACTION_KEYS) {
      expect(servedKeys.has(key), `primary key ${key} not served`).toBe(true);
    }
  });

  it("moreActionsPreview joins the SERVED names with dots", () => {
    expect(
      moreActionsPreview([
        { key: "disengage", name: "Disengage", cost: "action", description: "" },
        { key: "hide", name: "Hide", cost: "action", description: "" },
      ]),
    ).toBe("Disengage · Hide");
    // The 2024 rename reaches the preview because it reads `name`, not `key`.
    expect(
      moreActionsPreview([{ key: "useObject", name: "Utilize", cost: "action", description: "" }]),
    ).toBe("Utilize");
  });
});
