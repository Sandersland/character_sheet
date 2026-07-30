// Pure (no DB) tests for deriveEntryScopedResources (#1177): the shared rule
// function that re-derives the choice-cap fields (maneuvers/tool
// profs/subclassChoices) per class entry at that entry's OWN effective level,
// instead of always reading the primary entry at total level. Consumed by
// applyResourceOpInTx (write-side), loadResourcesReconcileState (reconcile-on-
// write), and buildResourcesView (clamp-on-read) — see CLAUDE.md's
// level-gated-registry rule: one shared function, never two inline copies.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedResources, deriveResources, SHARED_POOL_MERGE } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 16,
  dexterity: 14,
  constitution: 14,
  intelligence: 10,
  wisdom: 13,
  charisma: 12,
};

describe("deriveEntryScopedResources", () => {
  it("single-class Battle Master fighter: output is identical to a bare deriveResources call", () => {
    const level = 7;
    const profBonus = proficiencyBonusForLevel(level);
    const entries = [{ name: "fighter", subclass: "battle master", level }];

    const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
    const bare = deriveResources("fighter", "battle master", level, ABILITY_SCORES, profBonus, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");

    expect(derived).toEqual(bare);
  });

  it("single-class Warrior of the Elements monk: output is identical to a bare deriveResources call", () => {
    const level = 6;
    const profBonus = proficiencyBonusForLevel(level);
    const entries = [{ name: "monk", subclass: "warrior of the elements", level }];

    const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
    const bare = deriveResources("monk", "warrior of the elements", level, ABILITY_SCORES, profBonus, testFeatureRowsFor("monk", "warrior of the elements"), "EDITION_2024");

    expect(derived).toEqual(bare);
  });

  it("wizard primary / Battle Master fighter SECONDARY: maneuverChoiceCount comes from the fighter entry's own level (7), not total level", () => {
    const totalLevel = 10; // wizard 3 + fighter 7
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "wizard", subclass: "school of evocation", level: 3 },
      { name: "fighter", subclass: "battle master", level: 7 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    // Fighter-7 Battle Master maneuver cap is 5 (battleMasterManeuverCount) — NOT
    // the count a level-10 Battle Master would have (still 5 here, so also pin
    // the entry-level DC which differs from a total-level derivation).
    expect(derived?.maneuverChoiceCount).toBe(5);
    const bareAtEntryLevel = deriveResources("fighter", "battle master", 7, ABILITY_SCORES, profBonus, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(derived?.maneuverSaveDC).toBe(bareAtEntryLevel?.maneuverSaveDC);
  });

  it("Battle Master fighter PRIMARY in a multiclass: caps derive at the primary entry's own level, not the summed total", () => {
    const totalLevel = 10; // fighter 4 + wizard 6
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "fighter", subclass: "battle master", level: 4 },
      { name: "wizard", subclass: "school of evocation", level: 6 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    // Fighter-4 Battle Master maneuver cap is 3 (battleMasterManeuverCount < 7 →
    // 3) — a total-level (10) derivation would wrongly report 7.
    expect(derived?.maneuverChoiceCount).toBe(3);
    const wrongTotalLevelCount = deriveResources("fighter", "battle master", totalLevel, ABILITY_SCORES, profBonus, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(wrongTotalLevelCount?.maneuverChoiceCount).toBe(7);
    expect(derived?.maneuverChoiceCount).not.toBe(wrongTotalLevelCount?.maneuverChoiceCount);
  });

  // studentOfWarToolCount is a flat 1 from Battle Master level 3, so the only
  // level that tells an entry-scoped derivation apart from a total-level one is
  // below the subclass gate: a fighter-2 entry contributes no cap at all, where
  // a total-level (10) read would wrongly report 1.
  it("wizard 8 / fighter 2 SECONDARY: toolProfChoiceCount is absent — the fighter entry is below the Battle Master gate", () => {
    const totalLevel = 10; // wizard 8 + fighter 2
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "wizard", subclass: "school of evocation", level: 8 },
      { name: "fighter", subclass: "battle master", level: 2 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    expect(derived?.toolProfChoiceCount).toBeUndefined();
    const wrongTotalLevel = deriveResources("fighter", "battle master", totalLevel, ABILITY_SCORES, profBonus, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(wrongTotalLevel?.toolProfChoiceCount).toBe(1);
  });

  it("Hunter Ranger SECONDARY: subclassChoices (Hunter's Prey) are present, scoped to the ranger entry's own level", () => {
    const totalLevel = 10; // cleric 7 + ranger 3
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "cleric", subclass: "life domain", level: 7 },
      { name: "ranger", subclass: "hunter", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    expect(derived?.subclassChoices).toBeDefined();
    const huntersPrey = derived?.subclassChoices?.find((c) => c.key === "huntersPrey");
    expect(huntersPrey).toMatchObject({ key: "huntersPrey", count: 1 });
    // The L7-gated Defensive Tactics choice must NOT appear at ranger entry level 3.
    expect(derived?.subclassChoices?.some((c) => c.key === "defensiveTactics")).toBe(false);
  });

  // #1071: pools (focus/superiority dice/rage/sorcery points/etc.) must scale to
  // each class entry's OWN level, not the primary entry's total-level pool set.
  it("Monk 5 / Fighter (Battle Master) 3: focus pool (monk L5) and superiority dice (fighter L3) both appear simultaneously", () => {
    const totalLevel = 8; // monk 5 + fighter 3
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "monk", subclass: undefined, level: 5 },
      { name: "fighter", subclass: "battle master", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    const focus = derived?.resources.find((r) => r.key === "focus");
    // Focus total = monk level (5), NOT total character level (8).
    expect(focus?.total).toBe(5);

    const superiorityDice = derived?.resources.find((r) => r.key === "superiorityDice");
    // Superiority dice count at fighter level 3 (battleMasterDiceCount(3) === 4).
    expect(superiorityDice?.total).toBe(4);

    // Fighter's own base-class pools (secondWind, actionSurge at L3) are present too.
    expect(derived?.resources.find((r) => r.key === "secondWind")).toBeDefined();
    expect(derived?.resources.find((r) => r.key === "actionSurge")).toBeDefined();
  });

  it("single-class parity holds for the pool layer too: resources array is byte-identical to a bare deriveResources call", () => {
    const level = 5;
    const profBonus = proficiencyBonusForLevel(level);
    const entries = [{ name: "monk", subclass: undefined, level }];

    const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
    const bare = deriveResources("monk", undefined, level, ABILITY_SCORES, profBonus, testFeatureRowsFor("monk", undefined), "EDITION_2024");

    expect(derived?.resources).toEqual(bare?.resources);
  });

  // #1206: `features` must scale per entry too (previously seeded from the
  // primary entry at total level, so a secondary class's own features never
  // appeared and the primary's appeared at the wrong — too high — level).
  it("Monk 5 / Fighter (Battle Master) 3: features are scoped per entry — monk features up to L5, fighter features up to L3, no bleed", () => {
    const totalLevel = 8; // monk 5 + fighter 3
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "monk", subclass: undefined, level: 5 },
      { name: "fighter", subclass: "battle master", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
    const derivedNames = new Set(derived?.features?.map((f) => f.name));

    const bareMonkAt5 = deriveResources("monk", undefined, 5, ABILITY_SCORES, profBonus, testFeatureRowsFor("monk", undefined), "EDITION_2024");
    const bareFighterAt3 = deriveResources("fighter", "battle master", 3, ABILITY_SCORES, profBonus, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    const bareMonkAt8 = deriveResources("monk", undefined, 8, ABILITY_SCORES, profBonus, testFeatureRowsFor("monk", undefined), "EDITION_2024");
    const monkAt5Names = new Set(bareMonkAt5?.features.map((f) => f.name));

    // Every monk-L5 feature and every fighter-L3 feature is present...
    expect(bareMonkAt5?.features.every((f) => derivedNames.has(f.name))).toBe(true);
    expect(bareFighterAt3?.features.every((f) => derivedNames.has(f.name))).toBe(true);

    // ...but nothing the monk gains ONLY between L6-L8 leaks in — that would
    // only happen if features were still seeded from the primary at total
    // level instead of the monk entry's own level (5).
    const monkLevel6PlusNames = (bareMonkAt8?.features ?? [])
      .map((f) => f.name)
      .filter((name) => !monkAt5Names.has(name));
    expect(monkLevel6PlusNames.length).toBeGreaterThan(0); // sanity: monk does gain something L6-8
    expect(monkLevel6PlusNames.every((name) => !derivedNames.has(name))).toBe(true);
  });

  // The Warrior of Shadow feature-availability gate booleans that used to live
  // here moved off DerivedClassInfo onto DERIVED_ACTIONS rows (#1315) — see
  // entry-scoped-actions.test.ts for the equivalent entry-scoped-gate coverage
  // (deriveEntryScopedActions, keyed off the monk entry's own level).

  // #1340: cleric.ts and paladin.ts both emit a pool keyed "channelDivinity" —
  // before the fix, collectEntryScopedPools treated any repeated pool key as an
  // invariant violation and threw. PHB'14 p.164 (multiclassing): getting the
  // feature again from a second class grants that class's effects but no
  // additional use — so the two entries must MERGE into one pool at the MAX
  // total either class alone would grant, never the sum. These tests call
  // deriveEntryScopedResources directly (no serialize layer) so they fail if the
  // merge is ever moved to buildResourcesPayload instead of staying inside
  // collectEntryScopedPools — see the PR's placement-risk note.
  describe("channelDivinity — the one sanctioned shared pool key (#1340, PHB'14 p.164)", () => {
    it("cleric 2 / paladin 3 (total 5): one pool, total 1 (only cleric-2 and paladin-3 each grant 1)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 2 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 5, ABILITY_SCORES, proficiencyBonusForLevel(5), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pools = derived?.resources.filter((r) => r.key === "channelDivinity") ?? [];
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(1);
    });

    it("cleric 6 / paladin 4 (total 10): total is 2 (cleric-6's max), not the sum 3", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 6 },
        { name: "paladin", subclass: "oath of devotion", level: 4 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pool = derived?.resources.find((r) => r.key === "channelDivinity");
      expect(pool?.total).toBe(2);
    });

    it("paladin 4 (primary) / cleric 6 (secondary): total is still 2 — order-independent", () => {
      const entries = [
        { name: "paladin", subclass: "oath of devotion", level: 4 },
        { name: "cleric", subclass: "life domain", level: 6 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pool = derived?.resources.find((r) => r.key === "channelDivinity");
      expect(pool?.total).toBe(2);
    });

    it("non-total fields come from the PRIMARY entry (cleric-primary keeps the cleric's own label/recharge/description)", () => {
      const totalLevel = 10;
      const profBonus = proficiencyBonusForLevel(totalLevel);
      const entries = [
        { name: "cleric", subclass: "life domain", level: 6 },
        { name: "paladin", subclass: "oath of devotion", level: 4 },
      ];
      const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const merged = derived?.resources.find((r) => r.key === "channelDivinity");
      const bareCleric = deriveResources("cleric", "life domain", 6, ABILITY_SCORES, profBonus, testFeatureRowsFor("cleric", "life domain"), "EDITION_2024");
      const clericPool = bareCleric?.resources.find((r) => r.key === "channelDivinity");
      expect(merged?.label).toBe(clericPool?.label);
      expect(merged?.recharge).toBe(clericPool?.recharge);
      expect(merged?.description).toBe(clericPool?.description);
    });

    it("non-total fields come from the PRIMARY entry (paladin-primary keeps the paladin's own label/recharge/description)", () => {
      const totalLevel = 10;
      const profBonus = proficiencyBonusForLevel(totalLevel);
      const entries = [
        { name: "paladin", subclass: "oath of devotion", level: 4 },
        { name: "cleric", subclass: "life domain", level: 6 },
      ];
      const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const merged = derived?.resources.find((r) => r.key === "channelDivinity");
      const barePaladin = deriveResources("paladin", "oath of devotion", 4, ABILITY_SCORES, profBonus, testFeatureRowsFor("paladin", "oath of devotion"), "EDITION_2024");
      const paladinPool = barePaladin?.resources.find((r) => r.key === "channelDivinity");
      expect(merged?.label).toBe(paladinPool?.label);
      expect(merged?.recharge).toBe(paladinPool?.recharge);
      expect(merged?.description).toBe(paladinPool?.description);
    });

    it("cleric 1 / paladin 3: one pool, total 1 (only paladin contributes — cleric hasn't reached L2 yet)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 1 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 4, ABILITY_SCORES, proficiencyBonusForLevel(4), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pools = derived?.resources.filter((r) => r.key === "channelDivinity") ?? [];
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(1);
    });

    it("single-class parity: cleric 6 alone is byte-identical to a bare deriveResources call", () => {
      const level = 6;
      const profBonus = proficiencyBonusForLevel(level);
      const entries = [{ name: "cleric", subclass: "life domain", level }];
      const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const bare = deriveResources("cleric", "life domain", level, ABILITY_SCORES, profBonus, testFeatureRowsFor("cleric", "life domain"), "EDITION_2024");
      expect(derived).toEqual(bare);
    });

    it("single-class parity: paladin 4 alone is byte-identical to a bare deriveResources call", () => {
      const level = 4;
      const profBonus = proficiencyBonusForLevel(level);
      const entries = [{ name: "paladin", subclass: "oath of devotion", level }];
      const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const bare = deriveResources("paladin", "oath of devotion", level, ABILITY_SCORES, profBonus, testFeatureRowsFor("paladin", "oath of devotion"), "EDITION_2024");
      expect(derived).toEqual(bare);
    });
  });

  // The invariant collectEntryScopedPools still enforces: a duplicate pool key
  // NOT sanctioned in SHARED_POOL_MERGE remains a hard throw — two classes
  // silently fighting over one persisted `used` counter is a bug, not a merge
  // candidate. Two monk entries both emitting "focus" exercises this with real
  // registry data (same trick as entry-scoped-actions.test.ts's dedupe test).
  it("an unsanctioned duplicate pool key still throws (two monk entries both emitting focus)", () => {
    const entries = [
      { name: "monk", subclass: undefined, level: 5 },
      { name: "monk", subclass: undefined, level: 5 },
    ];
    expect(() =>
      deriveEntryScopedResources(entries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass)),
    ).toThrow(/duplicate pool key "focus"/);
  });

  // Standing invariant (#1340 scope item 3): any pool key two different classes
  // emit MUST be sanctioned in SHARED_POOL_MERGE — loops every class × every
  // level so the next colliding class module fails THIS test (with a clear
  // "add it to SHARED_POOL_MERGE" fix) instead of shipping a 500. Also pins
  // that SHARED_POOL_MERGE carries no unnecessary entries beyond the real
  // cross-class keys.
  it("every cross-class pool key is sanctioned in SHARED_POOL_MERGE, and SHARED_POOL_MERGE carries no extra entries (#1340)", () => {
    const CLASS_NAMES = [
      "barbarian", "bard", "cleric", "druid", "fighter", "monk",
      "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
    ];
    const classesByPoolKey = new Map<string, Set<string>>();
    for (const className of CLASS_NAMES) {
      for (let level = 1; level <= 20; level++) {
        const profBonus = proficiencyBonusForLevel(level);
        const info = deriveResources(className, undefined, level, ABILITY_SCORES, profBonus, testFeatureRowsFor(className, undefined), "EDITION_2024");
        for (const pool of info?.resources ?? []) {
          const classes = classesByPoolKey.get(pool.key) ?? new Set<string>();
          classes.add(className);
          classesByPoolKey.set(pool.key, classes);
        }
      }
    }
    const crossClassKeys = [...classesByPoolKey.entries()].filter(([, classes]) => classes.size > 1).map(([key]) => key);
    expect(crossClassKeys.sort()).toEqual(Object.keys(SHARED_POOL_MERGE).sort());
  });
});
