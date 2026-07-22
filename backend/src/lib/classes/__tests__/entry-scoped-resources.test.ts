// Pure (no DB) tests for deriveEntryScopedResources (#1177): the shared rule
// function that re-derives the choice-cap fields (maneuvers/tool
// profs/subclassChoices) per class entry at that entry's OWN effective level,
// instead of always reading the primary entry at total level. Consumed by
// applyResourceOpInTx (write-side), loadResourcesReconcileState (reconcile-on-
// write), and buildResourcesView (clamp-on-read) — see CLAUDE.md's
// level-gated-registry rule: one shared function, never two inline copies.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedResources, deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

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

    const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus);
    const bare = deriveResources("fighter", "battle master", level, ABILITY_SCORES, profBonus);

    expect(derived).toEqual(bare);
  });

  it("single-class Warrior of the Elements monk: output is identical to a bare deriveResources call", () => {
    const level = 6;
    const profBonus = proficiencyBonusForLevel(level);
    const entries = [{ name: "monk", subclass: "warrior of the elements", level }];

    const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus);
    const bare = deriveResources("monk", "warrior of the elements", level, ABILITY_SCORES, profBonus);

    expect(derived).toEqual(bare);
  });

  it("wizard primary / Battle Master fighter SECONDARY: maneuverChoiceCount comes from the fighter entry's own level (7), not total level", () => {
    const totalLevel = 10; // wizard 3 + fighter 7
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "wizard", subclass: "school of evocation", level: 3 },
      { name: "fighter", subclass: "battle master", level: 7 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);

    // Fighter-7 Battle Master maneuver cap is 5 (battleMasterManeuverCount) — NOT
    // the count a level-10 Battle Master would have (still 5 here, so also pin
    // the entry-level DC which differs from a total-level derivation).
    expect(derived?.maneuverChoiceCount).toBe(5);
    const bareAtEntryLevel = deriveResources("fighter", "battle master", 7, ABILITY_SCORES, profBonus);
    expect(derived?.maneuverSaveDC).toBe(bareAtEntryLevel?.maneuverSaveDC);
  });

  it("Battle Master fighter PRIMARY in a multiclass: caps derive at the primary entry's own level, not the summed total", () => {
    const totalLevel = 10; // fighter 4 + wizard 6
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "fighter", subclass: "battle master", level: 4 },
      { name: "wizard", subclass: "school of evocation", level: 6 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);

    // Fighter-4 Battle Master maneuver cap is 3 (battleMasterManeuverCount < 7 →
    // 3) — a total-level (10) derivation would wrongly report 7.
    expect(derived?.maneuverChoiceCount).toBe(3);
    const wrongTotalLevelCount = deriveResources("fighter", "battle master", totalLevel, ABILITY_SCORES, profBonus);
    expect(wrongTotalLevelCount?.maneuverChoiceCount).toBe(7);
    expect(derived?.maneuverChoiceCount).not.toBe(wrongTotalLevelCount?.maneuverChoiceCount);
  });

  it("Hunter Ranger SECONDARY: subclassChoices (Hunter's Prey) are present, scoped to the ranger entry's own level", () => {
    const totalLevel = 10; // cleric 7 + ranger 3
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "cleric", subclass: "life domain", level: 7 },
      { name: "ranger", subclass: "hunter", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);

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

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);

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

    const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus);
    const bare = deriveResources("monk", undefined, level, ABILITY_SCORES, profBonus);

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

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);
    const derivedNames = new Set(derived?.features?.map((f) => f.name));

    const bareMonkAt5 = deriveResources("monk", undefined, 5, ABILITY_SCORES, profBonus);
    const bareFighterAt3 = deriveResources("fighter", "battle master", 3, ABILITY_SCORES, profBonus);
    const bareMonkAt8 = deriveResources("monk", undefined, 8, ABILITY_SCORES, profBonus);
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

  // #1206: gate booleans (shadowArtsAvailable/cloakOfShadowsAvailable, and any
  // other deriveExtras scalar field) must key off the OWNING entry's own
  // level, not the primary entry at total level — previously a secondary
  // Warrior of Shadow monk got no gate at all (deriveExtras only ran on the
  // primary). Deliberately does NOT assert against a hardcoded total level —
  // only that the gate tracks the monk entry's own level, so this test stays
  // valid across any future edition change to the gate's level.
  it("Fighter 5 (primary) / Warrior of Shadow monk 3 (secondary): shadowArtsAvailable is set, keyed off the monk entry's own level", () => {
    const totalLevel = 8; // fighter 5 + monk 3
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "fighter", subclass: undefined, level: 5 },
      { name: "monk", subclass: "warrior of shadow", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);

    const bareMonkAtEntryLevel = deriveResources("monk", "warrior of shadow", 3, ABILITY_SCORES, profBonus);
    expect(derived?.shadowArtsAvailable).toBe(bareMonkAtEntryLevel?.shadowArtsAvailable);
    expect(derived?.shadowArtsAvailable).toBe(true);
    // The primary (fighter) never sets this field — proves the value came
    // from overlaying the SECONDARY entry's own derivation, not the primary's.
    const bareFighterPrimary = deriveResources("fighter", undefined, totalLevel, ABILITY_SCORES, profBonus);
    expect(bareFighterPrimary?.shadowArtsAvailable).toBeUndefined();
  });
});
