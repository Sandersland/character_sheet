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

  it("Cleric 2→3 (unset) prompts the subclass choice at the default level 3 (#1128)", () => {
    const plan = buildLevelUpPlan(char("cleric", 2), target("cleric", 3, null));
    expect(kinds(plan)).toEqual(["hitPoints", "subclass", "review"]);
  });

  it("respects a passed-in non-default subclassLevel (subclass step at level 1)", () => {
    const plan = buildLevelUpPlan(char("cleric", 0), target("cleric", 1, null, 1));
    expect(kinds(plan)).toContain("subclass");
  });
});

describe("buildLevelUpPlan — bespoke choose-N (maneuvers/fightingStyleFeat/toolProficiency)", () => {
  it("Battle Master 6→7 grants 2 maneuvers", () => {
    const plan = buildLevelUpPlan(char("fighter", 6, "battle master"), target("fighter", 7, "battle master"));
    expect(kinds(plan)).toEqual(["hitPoints", "maneuvers", "review"]);
    expect(plan.find((s) => s.kind === "maneuvers")?.count).toBe(2);
  });

  it("Fighter 0→1 grants a Fighting Style feat (#1137)", () => {
    const plan = buildLevelUpPlan(char("fighter", 0), target("fighter", 1, null));
    expect(kinds(plan)).toEqual(["hitPoints", "fightingStyleFeat", "review"]);
    expect(plan.find((s) => s.kind === "fightingStyleFeat")?.count).toBe(1);
  });

  it("Paladin 1→2 and Ranger 1→2 grant a Fighting Style feat (#1137)", () => {
    for (const cls of ["paladin", "ranger"]) {
      const plan = buildLevelUpPlan(char(cls, 1), target(cls, 2, null));
      expect(kinds(plan)).toContain("fightingStyleFeat");
      expect(plan.find((s) => s.kind === "fightingStyleFeat")?.count).toBe(1);
    }
  });

  it("Paladin 2→3 and a Fighter level-up past 1 grant no fighting-style feat", () => {
    expect(kinds(buildLevelUpPlan(char("paladin", 2), target("paladin", 3, null)))).not.toContain("fightingStyleFeat");
    expect(kinds(buildLevelUpPlan(char("fighter", 4, "champion"), target("fighter", 5, "champion")))).not.toContain("fightingStyleFeat");
  });

  it("Battle Master 2→3 re-plan (subclass pre-chosen) surfaces maneuvers + tool proficiency", () => {
    const plan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, "battle master"));
    expect(kinds(plan)).toEqual(["hitPoints", "maneuvers", "toolProficiency", "review"]);
    expect(plan.find((s) => s.kind === "maneuvers")?.count).toBe(3);
    expect(plan.find((s) => s.kind === "toolProficiency")?.count).toBe(1);
  });

  it("Champion 2→3 grants a subclass but no maneuvers", () => {
    const plan = buildLevelUpPlan(char("fighter", 2, "champion"), target("fighter", 3, "champion"));
    expect(kinds(plan)).not.toContain("maneuvers");
  });

  it("Warrior of the Elements 5→6 has no choice step (all features are fixed)", () => {
    const plan = buildLevelUpPlan(
      char("monk", 5, "warrior of the elements"),
      target("monk", 6, "warrior of the elements"),
    );
    expect(kinds(plan)).toEqual(["hitPoints", "review"]);
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

describe("buildLevelUpPlan — newSpells (2024 prepared model)", () => {
  it("Wizard 7→8 scribes 2 spells, after advancement, before review — no swap", () => {
    const plan = buildLevelUpPlan(char("wizard", 7), target("wizard", 8));
    expect(kinds(plan)).toEqual(["hitPoints", "advancement", "newSpells", "review"]);
    const step = plan.find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(2);
    expect(step?.meta?.canSwap).toBeUndefined(); // wizard re-prepares on a rest, no level-up swap
  });

  it("carries the derived spell-level ceiling in meta.maxSpellLevel", () => {
    expect(buildLevelUpPlan(char("wizard", 2), target("wizard", 3)).find((s) => s.kind === "newSpells")?.meta?.maxSpellLevel).toBe(2);
    expect(buildLevelUpPlan(char("wizard", 8), target("wizard", 9)).find((s) => s.kind === "newSpells")?.meta?.maxSpellLevel).toBe(5);
    // Sorcerer learn level: ceiling present, no Magical Secrets flag.
    const sorc = buildLevelUpPlan(char("sorcerer", 4), target("sorcerer", 5)).find((s) => s.kind === "newSpells");
    expect(sorc?.meta?.maxSpellLevel).toBe(3);
    expect(sorc?.meta?.magicalSecrets).toBeUndefined();
  });

  it("Sorcerer 1→2 offers the prepared-count delta (2) with a swap", () => {
    const step = buildLevelUpPlan(char("sorcerer", 1), target("sorcerer", 2)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(2); // sorcerer prepared 2→4
    expect(step?.meta?.canSwap).toBe(true);
  });

  it("re-prepare classes get a cantrip-only newSpells step at cantrip levels, none otherwise (#1131)", () => {
    // Cleric/Druid gain a cantrip at level 4 → a count-0 cantrips-only step, no swap.
    const cleric = buildLevelUpPlan(char("cleric", 3), target("cleric", 4)).find((s) => s.kind === "newSpells");
    expect(cleric?.count).toBe(0);
    expect(cleric?.meta?.cantrips).toBe(1);
    expect(cleric?.meta?.canSwap).toBeUndefined();
    // Flat levels (no new spells, no new cantrips) still emit nothing.
    expect(kinds(buildLevelUpPlan(char("cleric", 4), target("cleric", 5)))).not.toContain("newSpells");
    expect(kinds(buildLevelUpPlan(char("druid", 4), target("druid", 5)))).not.toContain("newSpells");
    // Paladin/Ranger prepare no cantrips → never a step from cantrips.
    expect(kinds(buildLevelUpPlan(char("paladin", 3), target("paladin", 4)))).not.toContain("newSpells");
    expect(kinds(buildLevelUpPlan(char("ranger", 3), target("ranger", 4)))).not.toContain("newSpells");
  });

  it("warlock 3→4 offers a spell and a cantrip (#1131)", () => {
    const step = buildLevelUpPlan(char("warlock", 3), target("warlock", 4)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(1);
    expect(step?.meta?.cantrips).toBe(1);
  });

  // A fresh level-1 entry offers its full initial picks with no swap (a new
  // entry must not swap other classes' spells, #1131).
  const freshL1 = (cls: string) => buildLevelUpPlan(char(cls, 0), target(cls, 1)).find((s) => s.kind === "newSpells");

  it("a fresh level-1 Cleric offers 4 spells + 3 cantrips, no swap (#1131)", () => {
    expect(freshL1("cleric")).toMatchObject({ count: 4, meta: { cantrips: 3 } });
    expect(freshL1("cleric")?.meta?.canSwap).toBeUndefined();
  });

  it("a fresh level-1 Paladin offers 2 spells, no cantrips, no swap (#1131)", () => {
    expect(freshL1("paladin")?.count).toBe(2);
    expect(freshL1("paladin")?.meta?.cantrips).toBeUndefined();
    expect(freshL1("paladin")?.meta?.canSwap).toBeUndefined();
  });

  it("a fresh level-1 Wizard offers 4 spells + 3 cantrips, no swap (#1131)", () => {
    expect(freshL1("wizard")).toMatchObject({ count: 4, meta: { cantrips: 3 } });
    expect(freshL1("wizard")?.meta?.canSwap).toBeUndefined();
  });

  it("a fresh onLevelUp caster (Sorcerer) gets no swap at level 1; a Fighter emits nothing (#1131)", () => {
    expect(freshL1("sorcerer")?.meta?.canSwap).toBeUndefined();
    expect(kinds(buildLevelUpPlan(char("fighter", 0), target("fighter", 1)))).not.toContain("newSpells");
  });

  it("emits a swap-only newSpells step on a flat onLevelUp level (Warlock 9→10, #1101)", () => {
    const step = buildLevelUpPlan(char("warlock", 9), target("warlock", 10)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(0); // warlock prepared 10→10
    expect(step?.meta?.canSwap).toBe(true);
  });

  it("onLevelUp casters carry meta.canSwap on a normal learn level (Bard 2→3, #1101)", () => {
    const step = buildLevelUpPlan(char("bard", 2), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(1);
    expect(step?.meta?.canSwap).toBe(true);
  });

  it("Wizard (a spellbook caster) never carries canSwap (#1101)", () => {
    const step = buildLevelUpPlan(char("wizard", 3), target("wizard", 4)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(2);
    expect(step?.meta?.canSwap).toBeUndefined();
  });

  it("a plain Fighter 1→2 (non-caster) still emits no newSpells step", () => {
    expect(kinds(buildLevelUpPlan(char("fighter", 1), target("fighter", 2)))).not.toContain("newSpells");
  });

  it("tags every Bard level from 10 as Magical Secrets, not a normal learn level (2024)", () => {
    const secrets = buildLevelUpPlan(char("bard", 9), target("bard", 10)).find((s) => s.kind === "newSpells");
    expect(secrets?.count).toBe(1);
    expect(secrets?.meta?.magicalSecrets).toBe(true);
    expect(secrets?.meta?.maxSpellLevel).toBe(5);

    // 2024: Magical Secrets applies to any Bard pick from level 10 up (not just 10/14/18).
    const past = buildLevelUpPlan(char("bard", 10), target("bard", 11)).find((s) => s.kind === "newSpells");
    expect(past?.meta?.magicalSecrets).toBe(true);

    const normal = buildLevelUpPlan(char("bard", 2), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(normal?.count).toBe(1);
    expect(normal?.meta?.magicalSecrets).toBeUndefined();
    expect(normal?.meta?.maxSpellLevel).toBe(2);
  });

  it("third-caster subclasses (Eldritch Knight / Arcane Trickster) offer a delta pick + swap (#1101)", () => {
    const ek = buildLevelUpPlan(char("fighter", 3, "eldritch knight"), target("fighter", 4, "eldritch knight")).find((s) => s.kind === "newSpells");
    expect(ek?.count).toBe(1); // EK prepared 3→4
    expect(ek?.meta?.canSwap).toBe(true);
    const at = buildLevelUpPlan(char("rogue", 3, "arcane trickster"), target("rogue", 4, "arcane trickster")).find((s) => s.kind === "newSpells");
    expect(at?.count).toBe(1);
    expect(at?.meta?.canSwap).toBe(true);
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
