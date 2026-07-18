import { describe, it, expect } from "vitest";

import {
  buildLevelUpPlan,
  type LevelUpPlanCharacter,
  type TargetClassEntry,
} from "@/lib/leveling/level-up-plan.js";
import {
  resolveLevelUpPlan,
  validateLevelUpSubmission,
  InvalidLevelUpError,
  type LevelUpSubmission,
} from "@/lib/leveling/level-up-submission.js";

const ABILITIES = { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 10 };

function char(name: string, level: number, subclass: string | null = null): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name, level, subclass }] };
}

function target(name: string, newLevel: number, subclass: string | null = null, subclassLevel?: number): TargetClassEntry {
  return { name, newLevel, subclass, subclassLevel };
}

const takeAsi: LevelUpSubmission["advancement"] = {
  type: "takeAsi",
  increases: [{ ability: "strength", amount: 2 }],
};

function maneuver(id: string): NonNullable<LevelUpSubmission["maneuvers"]>[number] {
  return { type: "learnManeuver", maneuverId: id };
}

function kinds(steps: ReturnType<typeof validateLevelUpSubmission>): string[] {
  return steps.map((s) => s.kind);
}

describe("resolveLevelUpPlan — submission-free plan resolution (#886)", () => {
  it("Fighter 7→8 resolves the base plan", () => {
    const steps = resolveLevelUpPlan(char("fighter", 7, "champion"), target("fighter", 8, "champion"), null);
    expect(steps.map((s) => s.kind)).toEqual(["hitPoints", "advancement", "review"]);
  });

  it("Fighter 2→3 with no subclass chosen surfaces only the subclass step", () => {
    const steps = resolveLevelUpPlan(char("fighter", 2), target("fighter", 3, null), null);
    expect(steps.map((s) => s.kind)).toEqual(["hitPoints", "subclass", "review"]);
  });

  it("Fighter 2→3 with Battle Master chosen re-plans and splices the subclass step", () => {
    const steps = resolveLevelUpPlan(char("fighter", 2), target("fighter", 3, null), "battle master");
    expect(steps.map((s) => s.kind)).toEqual(["hitPoints", "subclass", "maneuvers", "toolProficiency", "review"]);
    const replan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, "battle master"));
    expect(steps.filter((s) => s.kind !== "subclass")).toEqual(replan);
  });
});

describe("validateLevelUpSubmission — happy paths", () => {
  it("Fighter 7→8 with hp + advancement returns the ordered steps", () => {
    const steps = validateLevelUpSubmission(
      char("fighter", 7, "champion"),
      target("fighter", 8, "champion"),
      null,
      { target: { kind: "existing", classEntryId: "x" }, hp: { method: "average" }, advancement: takeAsi },
    );
    expect(kinds(steps)).toEqual(["hitPoints", "advancement", "review"]);
  });
});

describe("validateLevelUpSubmission — count mismatches", () => {
  it("Fighter 7→8 missing advancement throws naming the step", () => {
    expect(() =>
      validateLevelUpSubmission(
        char("fighter", 7, "champion"),
        target("fighter", 8, "champion"),
        null,
        { target: { kind: "existing", classEntryId: "x" }, hp: { method: "average" } },
      ),
    ).toThrow(/advancement/);
  });

  it("wrong maneuver count throws 'expected N maneuvers'", () => {
    expect(() =>
      validateLevelUpSubmission(
        char("fighter", 2),
        target("fighter", 3, null),
        "battle master",
        {
          target: { kind: "existing", classEntryId: "x" },
          hp: { method: "average" },
          subclassId: "sc-1",
          maneuvers: [maneuver("m1")],
          toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
        },
      ),
    ).toThrow(/expected 3 maneuvers/);
  });
});

describe("validateLevelUpSubmission — excess submissions", () => {
  it("spells submitted on a non-caster level throws 'does not grant new spells'", () => {
    expect(() =>
      validateLevelUpSubmission(
        char("fighter", 7, "champion"),
        target("fighter", 8, "champion"),
        null,
        {
          target: { kind: "existing", classEntryId: "x" },
          hp: { method: "average" },
          advancement: takeAsi,
          spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
        },
      ),
    ).toThrow(/does not grant new spells/);
  });

  it("subclassChoices entry with an unknown choice key throws", () => {
    expect(() =>
      validateLevelUpSubmission(
        char("fighter", 7, "champion"),
        target("fighter", 8, "champion"),
        null,
        {
          target: { kind: "existing", classEntryId: "x" },
          hp: { method: "average" },
          advancement: takeAsi,
          subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "bogus", custom: { name: "x", description: "y" } }],
        },
      ),
    ).toThrow(InvalidLevelUpError);
  });
});

describe("validateLevelUpSubmission — subclass re-plan contract", () => {
  it("Fighter 2→3 at the subclass level without subclassId throws 'requires choosing a subclass'", () => {
    expect(() =>
      validateLevelUpSubmission(
        char("fighter", 2),
        target("fighter", 3, null),
        null,
        { target: { kind: "existing", classEntryId: "x" }, hp: { method: "average" } },
      ),
    ).toThrow(/requires choosing a subclass/);
  });

  it("subclassId submitted when the level grants no subclass throws", () => {
    expect(() =>
      validateLevelUpSubmission(
        char("fighter", 7, "champion"),
        target("fighter", 8, "champion"),
        "champion",
        {
          target: { kind: "existing", classEntryId: "x" },
          hp: { method: "average" },
          advancement: takeAsi,
          subclassId: "sc-1",
        },
      ),
    ).toThrow(/does not include a subclass choice/);
  });

  it("happy Battle Master 2→3 ceremony places subclass at its canonical position", () => {
    const steps = validateLevelUpSubmission(
      char("fighter", 2),
      target("fighter", 3, null),
      "battle master",
      {
        target: { kind: "existing", classEntryId: "x" },
        hp: { method: "average" },
        subclassId: "sc-1",
        maneuvers: [maneuver("m1"), maneuver("m2"), maneuver("m3")],
        toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
      },
    );
    // Effective plan mirrors buildLevelUpPlan for the chosen subclass, with the
    // subclass step spliced after hitPoints (no advancement) and before maneuvers.
    expect(kinds(steps)).toEqual(["hitPoints", "subclass", "maneuvers", "toolProficiency", "review"]);
    const replan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, "battle master"));
    expect(steps.filter((s) => s.kind !== "subclass")).toEqual(replan);
  });
});
