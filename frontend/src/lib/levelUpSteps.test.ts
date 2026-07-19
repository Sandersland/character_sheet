import { describe, expect, it } from "vitest";

import {
  ceremonyBlocked,
  draftSatisfies,
  railState,
  stepKey,
  stepLabel,
  stepPosition,
  type LevelUpDraft,
} from "@/lib/levelUpSteps";
import type { LevelUpPlanResponse, LevelUpStep } from "@/types/character";

const PLAN: LevelUpStep[] = [
  { kind: "hitPoints" },
  { kind: "advancement", count: 1 },
  { kind: "review" },
];

describe("stepKey", () => {
  it("is the kind for singleton steps", () => {
    expect(stepKey({ kind: "hitPoints" })).toBe("hitPoints");
    expect(stepKey({ kind: "review" })).toBe("review");
  });

  it("suffixes meta.key so repeated subclassChoice steps stay unique and stable", () => {
    const prey = stepKey({ kind: "subclassChoice", count: 1, meta: { key: "huntersPrey", label: "Hunter's Prey" } });
    const defense = stepKey({ kind: "subclassChoice", count: 1, meta: { key: "defensiveTactics", label: "Defensive Tactics" } });
    expect(prey).toBe("subclassChoice:huntersPrey");
    expect(defense).toBe("subclassChoice:defensiveTactics");
    expect(prey).not.toBe(defense);
  });
});

describe("stepLabel", () => {
  it("maps kinds to display names, never the raw key", () => {
    expect(stepLabel({ kind: "hitPoints" })).toBe("Hit Points");
    expect(stepLabel({ kind: "advancement" })).toBe("Ability Score / Feat");
    expect(stepLabel({ kind: "fightingStyle" })).toBe("Fighting Style");
    expect(stepLabel({ kind: "toolProficiency" })).toBe("Tool Proficiency");
    expect(stepLabel({ kind: "newSpells" })).toBe("New Spells");
    expect(stepLabel({ kind: "review" })).toBe("Review");
  });

  it("uses meta.label for a subclassChoice step", () => {
    expect(stepLabel({ kind: "subclassChoice", meta: { key: "huntersPrey", label: "Hunter's Prey" } })).toBe(
      "Hunter's Prey",
    );
  });
});

describe("railState", () => {
  it("marks steps before the current key done, the current active, the rest pending", () => {
    expect(railState(PLAN, "advancement")).toEqual(["done", "active", "pending"]);
    expect(railState(PLAN, "hitPoints")).toEqual(["active", "pending", "pending"]);
    expect(railState(PLAN, "review")).toEqual(["done", "done", "active"]);
  });

  it("falls back to the first step when the key is unknown (e.g. after a re-plan)", () => {
    expect(railState(PLAN, "gone")).toEqual(["active", "pending", "pending"]);
  });
});

describe("stepPosition", () => {
  it("finds the index of the named step, falling back to 0 for an unknown key", () => {
    expect(stepPosition(PLAN, "advancement")).toBe(1);
    expect(stepPosition(PLAN, "review")).toBe(2);
    expect(stepPosition(PLAN, "gone")).toBe(0);
    expect(stepPosition([], "hitPoints")).toBe(0);
  });
});

describe("ceremonyBlocked", () => {
  function plan(steps: LevelUpStep[], isPrimary: boolean): LevelUpPlanResponse {
    return { target: { className: "fighter", subclass: null, newLevel: 3, isPrimary }, steps };
  }

  it("blocks a non-primary plan containing a resource-backed step (#1065)", () => {
    expect(ceremonyBlocked(plan([{ kind: "hitPoints" }, { kind: "maneuvers", count: 2 }, { kind: "review" }], false))).toBe(true);
    expect(ceremonyBlocked(plan([{ kind: "hitPoints" }, { kind: "disciplines", count: 1 }], false))).toBe(true);
    expect(ceremonyBlocked(plan([{ kind: "toolProficiency", count: 1 }], false))).toBe(true);
    expect(
      ceremonyBlocked(plan([{ kind: "subclassChoice", count: 1, meta: { key: "huntersPrey", label: "Hunter's Prey" } }], false)),
    ).toBe(true);
  });

  it("does not block subclass/fightingStyle steps (entry-aware since #1065), primary plans, or a missing plan", () => {
    expect(ceremonyBlocked(plan([{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "review" }], false))).toBe(false);
    expect(ceremonyBlocked(plan([{ kind: "hitPoints" }, { kind: "fightingStyle", count: 1 }], false))).toBe(false);
    expect(ceremonyBlocked(plan([{ kind: "hitPoints" }, { kind: "maneuvers", count: 2 }, { kind: "review" }], true))).toBe(false);
    expect(ceremonyBlocked(null)).toBe(false);
  });
});

describe("draftSatisfies", () => {
  const empty: LevelUpDraft = { hp: { method: "average" } };

  it("hitPoints needs hp — and a roll value when method is roll", () => {
    expect(draftSatisfies({ kind: "hitPoints" }, empty)).toBe(true);
    expect(draftSatisfies({ kind: "hitPoints" }, { hp: { method: "roll" } })).toBe(false);
    expect(draftSatisfies({ kind: "hitPoints" }, { hp: { method: "roll", roll: 7 } })).toBe(true);
  });

  it("advancement / subclass / fightingStyle need their single field", () => {
    expect(draftSatisfies({ kind: "advancement" }, empty)).toBe(false);
    expect(
      draftSatisfies(
        { kind: "advancement" },
        { ...empty, advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] } },
      ),
    ).toBe(true);
    expect(draftSatisfies({ kind: "subclass" }, empty)).toBe(false);
    expect(draftSatisfies({ kind: "subclass" }, { ...empty, subclassId: "sub-1" })).toBe(true);
    expect(draftSatisfies({ kind: "fightingStyle" }, empty)).toBe(false);
    expect(draftSatisfies({ kind: "fightingStyle" }, { ...empty, fightingStyle: "defense" })).toBe(true);
  });

  it("list steps need at least `count` entries", () => {
    const step: LevelUpStep = { kind: "maneuvers", count: 3 };
    expect(draftSatisfies(step, empty)).toBe(false);
    expect(
      draftSatisfies(step, { ...empty, maneuvers: [{ type: "learnManeuver", maneuverId: "m1" }] }),
    ).toBe(false);
    expect(
      draftSatisfies(step, {
        ...empty,
        maneuvers: [
          { type: "learnManeuver", maneuverId: "m1" },
          { type: "learnManeuver", maneuverId: "m2" },
          { type: "learnManeuver", maneuverId: "m3" },
        ],
      }),
    ).toBe(true);
  });

  it("subclassChoice counts only entries matching its meta.key", () => {
    const step: LevelUpStep = { kind: "subclassChoice", count: 1, meta: { key: "huntersPrey", label: "Hunter's Prey" } };
    const wrongKey: LevelUpDraft = {
      ...empty,
      subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "defensiveTactics", optionId: "o1" }],
    };
    expect(draftSatisfies(step, wrongKey)).toBe(false);
    expect(
      draftSatisfies(step, {
        ...empty,
        subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "o1" }],
      }),
    ).toBe(true);
  });

  it("newSpells reads spellsLearned; review is always satisfied", () => {
    expect(draftSatisfies({ kind: "newSpells", count: 2 }, empty)).toBe(false);
    expect(
      draftSatisfies({ kind: "newSpells", count: 2 }, {
        ...empty,
        spellsLearned: [
          { type: "learnSpell", spellId: "s1" },
          { type: "learnSpell", spellId: "s2" },
        ],
      }),
    ).toBe(true);
    expect(draftSatisfies({ kind: "review" }, empty)).toBe(true);
  });

  it("newSpells swap: a count-0 step needs a replacement learn per forget (#1101)", () => {
    const swapStep: LevelUpStep = { kind: "newSpells", count: 0, meta: { canSwap: true } };
    // No swap taken → trivially satisfied.
    expect(draftSatisfies(swapStep, empty)).toBe(true);
    // Forget with no replacement learn → unsatisfied (net count would be −1).
    expect(
      draftSatisfies(swapStep, { ...empty, spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }] }),
    ).toBe(false);
    // Forget + one replacement learn → satisfied.
    expect(
      draftSatisfies(swapStep, {
        ...empty,
        spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }],
        spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      }),
    ).toBe(true);
  });

  it("newSpells swap: a count-1 step with a forget needs two learns (#1101)", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 1, meta: { canSwap: true } };
    expect(
      draftSatisfies(step, {
        ...empty,
        spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }],
        spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      }),
    ).toBe(false);
    expect(
      draftSatisfies(step, {
        ...empty,
        spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }],
        spellsLearned: [
          { type: "learnSpell", spellId: "s1" },
          { type: "learnSpell", spellId: "s2" },
        ],
      }),
    ).toBe(true);
  });
});
