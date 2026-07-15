import { describe, it, expect } from "vitest";

import {
  buildLevelUpPlan,
  type LevelUpPlanCharacter,
  type TargetClassEntry,
} from "@/lib/leveling/level-up-plan.js";

const ABILITIES = { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 10 };

// Builds a single-class character in the pre-level-up state.
function char(name: string, level: number, subclass: string | null = null): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name, level, subclass }] };
}

function target(name: string, newLevel: number, subclass: string | null = null, subclassLevel?: number): TargetClassEntry {
  return { name, newLevel, subclass, subclassLevel };
}

// Extracts just the step kinds in order (the plan's ordered shape).
function kinds(steps: ReturnType<typeof buildLevelUpPlan>): string[] {
  return steps.map((s) => s.kind);
}

describe("buildLevelUpPlan — skeleton", () => {
  it("always brackets a plain level with hitPoints … review", () => {
    const plan = buildLevelUpPlan(char("fighter", 4), target("fighter", 5, "champion"));
    expect(kinds(plan)).toEqual(["hitPoints", "review"]);
  });
});

describe("buildLevelUpPlan — advancement (ASI/Feat)", () => {
  it("Fighter 7→8 grants one advancement slot", () => {
    const plan = buildLevelUpPlan(char("fighter", 7, "champion"), target("fighter", 8, "champion"));
    expect(kinds(plan)).toEqual(["hitPoints", "advancement", "review"]);
    expect(plan.find((s) => s.kind === "advancement")?.count).toBe(1);
  });

  it("Fighter 6→7 grants no advancement (level 7 is not an ASI level)", () => {
    const plan = buildLevelUpPlan(char("fighter", 6, "champion"), target("fighter", 7, "champion"));
    expect(kinds(plan)).not.toContain("advancement");
  });

  it("Fighter's bonus ASI at level 6 is recognised", () => {
    const plan = buildLevelUpPlan(char("fighter", 5, "champion"), target("fighter", 6, "champion"));
    expect(kinds(plan)).toEqual(["hitPoints", "advancement", "review"]);
  });
});

describe("buildLevelUpPlan — subclass", () => {
  it("Champion Fighter 2→3 (unset) prompts the subclass choice", () => {
    const plan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, null));
    expect(kinds(plan)).toEqual(["hitPoints", "subclass", "review"]);
  });

  it("an already-chosen subclass emits no subclass step at level 3", () => {
    const plan = buildLevelUpPlan(char("fighter", 2, "champion"), target("fighter", 3, "champion"));
    expect(kinds(plan)).not.toContain("subclass");
  });

  it("respects a passed-in subclassLevel (Cleric 0→1 with subclassLevel 1)", () => {
    const plan = buildLevelUpPlan(char("cleric", 0), target("cleric", 1, null, 1));
    expect(kinds(plan)).toContain("subclass");
  });
});

describe("buildLevelUpPlan — bespoke choose-N (maneuvers/fightingStyle/disciplines/toolProficiency)", () => {
  it("Battle Master 6→7 grants 2 maneuvers", () => {
    const plan = buildLevelUpPlan(char("fighter", 6, "battle master"), target("fighter", 7, "battle master"));
    expect(kinds(plan)).toEqual(["hitPoints", "maneuvers", "review"]);
    expect(plan.find((s) => s.kind === "maneuvers")?.count).toBe(2);
  });

  it("Fighter 0→1 grants a fighting style choice", () => {
    const plan = buildLevelUpPlan(char("fighter", 0), target("fighter", 1, null));
    expect(kinds(plan)).toEqual(["hitPoints", "fightingStyle", "review"]);
    expect(plan.find((s) => s.kind === "fightingStyle")?.count).toBe(1);
  });

  it("Battle Master 2→3 grants subclass + maneuvers + a tool proficiency", () => {
    const plan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, "battle master"));
    expect(kinds(plan)).toEqual(["hitPoints", "maneuvers", "toolProficiency", "review"]);
    expect(plan.find((s) => s.kind === "maneuvers")?.count).toBe(3);
    expect(plan.find((s) => s.kind === "toolProficiency")?.count).toBe(1);
  });

  it("Champion 2→3 grants a subclass but no maneuvers", () => {
    const plan = buildLevelUpPlan(char("fighter", 2, "champion"), target("fighter", 3, "champion"));
    expect(kinds(plan)).not.toContain("maneuvers");
  });

  it("Way of the Four Elements 5→6 grants a discipline", () => {
    const plan = buildLevelUpPlan(
      char("monk", 5, "way of the four elements"),
      target("monk", 6, "way of the four elements"),
    );
    expect(kinds(plan)).toEqual(["hitPoints", "disciplines", "review"]);
    expect(plan.find((s) => s.kind === "disciplines")?.count).toBe(1);
  });
});

describe("buildLevelUpPlan — generic subclassChoice (#899)", () => {
  it("Hunter Ranger 2→3 grants Hunter's Prey after the subclass step position", () => {
    const plan = buildLevelUpPlan(char("ranger", 2), target("ranger", 3, "hunter"));
    const choice = plan.find((s) => s.kind === "subclassChoice");
    expect(choice?.count).toBe(1);
    expect(choice?.meta).toMatchObject({ key: "huntersPrey", catalogSource: "huntersPrey" });
  });

  it("Hunter Ranger 6→7 grants Defensive Tactics only", () => {
    const plan = buildLevelUpPlan(char("ranger", 6, "hunter"), target("ranger", 7, "hunter"));
    const choices = plan.filter((s) => s.kind === "subclassChoice");
    expect(choices).toHaveLength(1);
    expect(choices[0].meta).toMatchObject({ key: "defensiveTactics" });
  });

  it("Beast Master 6→7 grants no generic choose-N", () => {
    const plan = buildLevelUpPlan(char("ranger", 6, "beast master"), target("ranger", 7, "beast master"));
    expect(kinds(plan)).not.toContain("subclassChoice");
  });
});

describe("buildLevelUpPlan — newSpells", () => {
  it("Wizard 7→8 learns 2 spells, after advancement, before review", () => {
    const plan = buildLevelUpPlan(char("wizard", 7), target("wizard", 8));
    expect(kinds(plan)).toEqual(["hitPoints", "advancement", "newSpells", "review"]);
    expect(plan.find((s) => s.kind === "newSpells")?.count).toBe(2);
  });

  it("Ranger 1→2 gains its first spells known", () => {
    const plan = buildLevelUpPlan(char("ranger", 1), target("ranger", 2));
    expect(kinds(plan)).toEqual(["hitPoints", "newSpells", "review"]);
    expect(plan.find((s) => s.kind === "newSpells")?.count).toBe(2);
  });

  it("prepared casters (Cleric/Druid/Paladin) never get a newSpells step", () => {
    expect(kinds(buildLevelUpPlan(char("cleric", 4), target("cleric", 5)))).not.toContain("newSpells");
    expect(kinds(buildLevelUpPlan(char("druid", 4), target("druid", 5)))).not.toContain("newSpells");
    expect(kinds(buildLevelUpPlan(char("paladin", 4), target("paladin", 5)))).not.toContain("newSpells");
  });

  it("omits newSpells on a flat known level (Sorcerer 11→12)", () => {
    const plan = buildLevelUpPlan(char("sorcerer", 11), target("sorcerer", 12));
    expect(kinds(plan)).not.toContain("newSpells");
  });

  it("tags a Bard Magical Secrets level (9→10) but not a normal learn level", () => {
    const secrets = buildLevelUpPlan(char("bard", 9), target("bard", 10)).find((s) => s.kind === "newSpells");
    expect(secrets?.count).toBe(2);
    expect(secrets?.meta?.magicalSecrets).toBe(true);

    const normal = buildLevelUpPlan(char("bard", 2), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(normal?.count).toBe(1);
    expect(normal?.meta?.magicalSecrets).toBeUndefined();
  });

  it("third-caster subclasses (Eldritch Knight / Arcane Trickster) emit no newSpells step", () => {
    expect(kinds(buildLevelUpPlan(char("fighter", 7, "eldritch knight"), target("fighter", 8, "eldritch knight")))).not.toContain("newSpells");
    expect(kinds(buildLevelUpPlan(char("rogue", 7, "arcane trickster"), target("rogue", 8, "arcane trickster")))).not.toContain("newSpells");
  });
});

describe("buildLevelUpPlan — subclass-unset re-plan contract", () => {
  it("Fighter 2→3 with subclass unset emits only the subclass step (no subclass-derived choices)", () => {
    const plan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, null));
    expect(kinds(plan)).toEqual(["hitPoints", "subclass", "review"]);
  });

  it("Fighter 2→3 with Battle Master set surfaces the subclass-derived choices", () => {
    const plan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, "battle master"));
    expect(kinds(plan)).toContain("maneuvers");
    expect(kinds(plan)).toContain("toolProficiency");
  });
});
