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

function char(
  name: string,
  level: number,
  subclass: string | null = null,
  spellEntries?: LevelUpPlanCharacter["spellEntries"],
): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name, level, subclass }], spellEntries };
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

describe("validateLevelUpSubmission — known-spell swap (#1101)", () => {
  const learn = (spellId: string): NonNullable<LevelUpSubmission["spellsLearned"]>[number] => ({ type: "learnSpell", spellId });
  const forget = (entryId: string): NonNullable<LevelUpSubmission["spellsForgotten"]>[number] => ({ type: "forgetSpell", entryId });
  const base = { target: { kind: "existing", classEntryId: "x" } as const, hp: { method: "average" as const } };
  // A user-learned (source null) level-1 known spell — the legal swap target.
  const KNOWN = [{ id: "e1", level: 1, source: null }];

  it("accepts a count-1 learn level plus one swap (2 learns, 1 forget)", () => {
    const steps = validateLevelUpSubmission(char("sorcerer", 4, null, KNOWN), target("sorcerer", 5), null, {
      ...base,
      spellsLearned: [learn("s1"), learn("s2")],
      spellsForgotten: [forget("e1")],
    });
    expect(kinds(steps)).toEqual(["hitPoints", "newSpells", "review"]);
  });

  it("accepts a swap-only level (count 0: 1 learn + 1 forget)", () => {
    const steps = validateLevelUpSubmission(char("sorcerer", 13, null, KNOWN), target("sorcerer", 14), null, {
      ...base,
      spellsLearned: [learn("s1")],
      spellsForgotten: [forget("e1")],
    });
    expect(kinds(steps)).toEqual(["hitPoints", "newSpells", "review"]);
  });

  it("accepts a swap-only level with no swap taken (0 learn, 0 forget)", () => {
    const steps = validateLevelUpSubmission(char("sorcerer", 13, null, KNOWN), target("sorcerer", 14), null, { ...base });
    expect(kinds(steps)).toEqual(["hitPoints", "newSpells", "review"]);
  });

  it("rejects two forgets", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 4, null, [{ id: "e1", level: 1, source: null }, { id: "e2", level: 1, source: null }]), target("sorcerer", 5), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2"), learn("s3")],
        spellsForgotten: [forget("e1"), forget("e2")],
      }),
    ).toThrow(/at most one/i);
  });

  it("rejects a forget on a level whose newSpells step cannot swap (Wizard)", () => {
    expect(() =>
      validateLevelUpSubmission(char("wizard", 3, null, KNOWN), target("wizard", 4), null, {
        ...base,
        advancement: takeAsi,
        spellsLearned: [learn("s1"), learn("s2"), learn("s3")],
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/does not allow swapping/i);
  });

  it("rejects a forget when there is no newSpells step at all (Fighter)", () => {
    expect(() =>
      validateLevelUpSubmission(char("fighter", 7, "champion", KNOWN), target("fighter", 8, "champion"), null, {
        ...base,
        advancement: takeAsi,
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/does not allow swapping/i);
  });

  it("rejects forgetting a cantrip entry (level 0)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 4, null, [{ id: "e1", level: 0, source: null }]), target("sorcerer", 5), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/cannot swap/i);
  });

  it("rejects forgetting a subclass-granted entry (source set)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 4, null, [{ id: "e1", level: 1, source: "subclass" }]), target("sorcerer", 5), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/cannot swap/i);
  });

  it("rejects forgetting an unknown entryId", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 4, null, KNOWN), target("sorcerer", 5), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
        spellsForgotten: [forget("nope")],
      }),
    ).toThrow(/cannot swap/i);
  });

  it("rejects a count-1 learn level with a forget but only 1 learn (net mismatch)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 4, null, KNOWN), target("sorcerer", 5), null, {
        ...base,
        spellsLearned: [learn("s1")],
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/new spells/i);
  });

  it("rejects a swap-only level with a forget but no replacement learn (net mismatch)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 13, null, KNOWN), target("sorcerer", 14), null, {
        ...base,
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/replacement spell/i);
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
