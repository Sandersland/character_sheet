// Pure (no DB) tests for deriveEntryScopedResources (#1177): the shared rule
// function that re-derives the choice-cap fields (maneuvers/disciplines/tool
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

    const { derived, disciplineLevel } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus);
    const bare = deriveResources("fighter", "battle master", level, ABILITY_SCORES, profBonus);

    expect(derived).toEqual(bare);
    expect(disciplineLevel).toBe(level); // fallback: no discipline-granting entry
  });

  it("single-class Way of the Four Elements monk: output is identical to a bare deriveResources call", () => {
    const level = 6;
    const profBonus = proficiencyBonusForLevel(level);
    const entries = [{ name: "monk", subclass: "way of the four elements", level }];

    const { derived, disciplineLevel } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus);
    const bare = deriveResources("monk", "way of the four elements", level, ABILITY_SCORES, profBonus);

    expect(derived).toEqual(bare);
    expect(disciplineLevel).toBe(level);
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

  it("Way of the Four Elements monk SECONDARY: disciplineLevel is the monk entry's own effective level", () => {
    const totalLevel = 9; // fighter 3 + monk 6
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "fighter", subclass: "champion", level: 3 },
      { name: "monk", subclass: "way of the four elements", level: 6 },
    ];

    const { derived, disciplineLevel } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);

    expect(disciplineLevel).toBe(6);
    // fourElementsDisciplineCount(6) === 2, not the level-9 value.
    expect(derived?.disciplineChoiceCount).toBe(2);
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

  // #1071: pools (ki/superiority dice/rage/sorcery points/etc.) must scale to
  // each class entry's OWN level, not the primary entry's total-level pool set.
  it("Monk 5 / Fighter (Battle Master) 3: ki pool (monk L5) and superiority dice (fighter L3) both appear simultaneously", () => {
    const totalLevel = 8; // monk 5 + fighter 3
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "monk", subclass: undefined, level: 5 },
      { name: "fighter", subclass: "battle master", level: 3 },
    ];

    const { derived } = deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus);

    const ki = derived?.resources.find((r) => r.key === "ki");
    // Ki total = monk level (5), NOT total character level (8).
    expect(ki?.total).toBe(5);

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
});
