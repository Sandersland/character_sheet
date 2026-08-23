// Pure (no DB) tests for deriveEntryScopedResources: re-derives the
// choice-cap fields per class entry at that entry's OWN effective level,
// instead of always reading the primary entry at total level.
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
    const totalLevel = 10;
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "wizard", subclass: "school of evocation", level: 3 },
      { name: "fighter", subclass: "battle master", level: 7 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    expect(derived?.maneuverChoiceCount).toBe(5);
    const bareAtEntryLevel = deriveResources("fighter", "battle master", 7, ABILITY_SCORES, profBonus, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(derived?.announcedSaveDC).toBe(bareAtEntryLevel?.announcedSaveDC);
  });

  it("Battle Master fighter PRIMARY in a multiclass: caps derive at the primary entry's own level, not the summed total", () => {
    const totalLevel = 10;
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "fighter", subclass: "battle master", level: 4 },
      { name: "wizard", subclass: "school of evocation", level: 6 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    expect(derived?.maneuverChoiceCount).toBe(3);
    const wrongTotalLevelCount = deriveResources("fighter", "battle master", totalLevel, ABILITY_SCORES, profBonus, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(wrongTotalLevelCount?.maneuverChoiceCount).toBe(7);
    expect(derived?.maneuverChoiceCount).not.toBe(wrongTotalLevelCount?.maneuverChoiceCount);
  });

  it("wizard 8 / fighter 2 SECONDARY: toolProfChoiceCount is absent — the fighter entry is below the Battle Master gate", () => {
    const totalLevel = 10;
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
    const totalLevel = 10;
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "cleric", subclass: "life domain", level: 7 },
      { name: "ranger", subclass: "hunter", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    expect(derived?.subclassChoices).toBeDefined();
    const huntersPrey = derived?.subclassChoices?.find((c) => c.key === "huntersPrey");
    expect(huntersPrey).toMatchObject({ key: "huntersPrey", count: 1 });
    expect(derived?.subclassChoices?.some((c) => c.key === "defensiveTactics")).toBe(false);
  });

  it("Monk 5 / Fighter (Battle Master) 3: focus pool (monk L5) and superiority dice (fighter L3) both appear simultaneously", () => {
    const totalLevel = 8;
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "monk", subclass: undefined, level: 5 },
      { name: "fighter", subclass: "battle master", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));

    const focus = derived?.resources.find((r) => r.key === "focus");
    expect(focus?.total).toBe(5);

    const superiorityDice = derived?.resources.find((r) => r.key === "superiorityDice");
    expect(superiorityDice?.total).toBe(4);

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

  it("Monk 5 / Fighter (Battle Master) 3: features are scoped per entry — monk features up to L5, fighter features up to L3, no bleed", () => {
    const totalLevel = 8;
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

    expect(bareMonkAt5?.features.every((f) => derivedNames.has(f.name))).toBe(true);
    expect(bareFighterAt3?.features.every((f) => derivedNames.has(f.name))).toBe(true);

    const monkLevel6PlusNames = (bareMonkAt8?.features ?? [])
      .map((f) => f.name)
      .filter((name) => !monkAt5Names.has(name));
    expect(monkLevel6PlusNames.length).toBeGreaterThan(0);
    expect(monkLevel6PlusNames.every((name) => !derivedNames.has(name))).toBe(true);
  });

  // PHB'14 p.164: gaining the feature again from a second class grants that
  // class's effects but no additional use, so the two entries must merge into
  // one pool at the MAX total either class alone grants, never the sum.
  describe("channelDivinity — the one sanctioned shared pool key (#1340, PHB'14 p.164)", () => {
    it("cleric 2 / paladin 3 (total 5): one pool, total 2 (cleric-2's 2 ties paladin-3's 2)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 2 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 5, ABILITY_SCORES, proficiencyBonusForLevel(5), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pools = derived?.resources.filter((r) => r.key === "channelDivinity") ?? [];
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(2);
    });

    // #1229: paladin@4's own pool is now 2 (not the pre-retab flat 1), so the
    // sum this asserts against is 5 (3+2), not the old 4 (3+1) — the max (3)
    // is unaffected either way.
    it("cleric 6 / paladin 4 (total 10): total is 3 (cleric-6's max), not the sum 5", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 6 },
        { name: "paladin", subclass: "oath of devotion", level: 4 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pool = derived?.resources.find((r) => r.key === "channelDivinity");
      expect(pool?.total).toBe(3);
    });

    it("paladin 4 (primary) / cleric 6 (secondary): total is still 3 — order-independent", () => {
      const entries = [
        { name: "paladin", subclass: "oath of devotion", level: 4 },
        { name: "cleric", subclass: "life domain", level: 6 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pool = derived?.resources.find((r) => r.key === "channelDivinity");
      expect(pool?.total).toBe(3);
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

    it("cleric 1 / paladin 3: one pool, total 2 (only paladin contributes — cleric hasn't reached L2 yet)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 1 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const { derived } = deriveEntryScopedResources(entries, 4, ABILITY_SCORES, proficiencyBonusForLevel(4), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass));
      const pools = derived?.resources.filter((r) => r.key === "channelDivinity") ?? [];
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(2);
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

  // A duplicate pool key not sanctioned in SHARED_POOL_MERGE is a hard throw
  // — two classes silently sharing one persisted counter is a bug, not a merge candidate.
  it("an unsanctioned duplicate pool key still throws (two monk entries both emitting focus)", () => {
    const entries = [
      { name: "monk", subclass: undefined, level: 5 },
      { name: "monk", subclass: undefined, level: 5 },
    ];
    expect(() =>
      deriveEntryScopedResources(entries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), "EDITION_2024", (e) => testFeatureRowsFor(e.name, e.subclass)),
    ).toThrow(/duplicate pool key "focus"/);
  });

  // Loops every class x every level so the next colliding class module fails
  // THIS test, with a clear "add it to SHARED_POOL_MERGE" fix, instead of shipping a 500.
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
