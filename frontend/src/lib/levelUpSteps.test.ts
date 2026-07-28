import { describe, expect, it } from "vitest";

import { choiceConfigForStep } from "@/lib/levelUpChoices";
import { applySubclassPick, draftSatisfies, pruneDraftToPlan, stepKey, stepLabel, type LevelUpDraft } from "@/lib/levelUpSteps";
import type { LevelUpStep } from "@/types/character";

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
    expect(stepLabel({ kind: "fightingStyleFeat" })).toBe("Fighting Style");
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

describe("draftSatisfies", () => {
  const empty: LevelUpDraft = { hp: { method: "average" } };

  it("hitPoints needs hp — and a roll value when method is roll", () => {
    expect(draftSatisfies({ kind: "hitPoints" }, empty)).toBe(true);
    expect(draftSatisfies({ kind: "hitPoints" }, { hp: { method: "roll" } })).toBe(false);
    expect(draftSatisfies({ kind: "hitPoints" }, { hp: { method: "roll", roll: 7 } })).toBe(true);
  });

  it("advancement / subclass / fightingStyleFeat need their single field", () => {
    expect(draftSatisfies({ kind: "advancement" }, empty)).toBe(false);
    expect(
      draftSatisfies(
        { kind: "advancement" },
        { ...empty, advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] } },
      ),
    ).toBe(true);
    expect(draftSatisfies({ kind: "subclass" }, empty)).toBe(false);
    expect(draftSatisfies({ kind: "subclass" }, { ...empty, subclassId: "sub-1" })).toBe(true);
    expect(draftSatisfies({ kind: "fightingStyleFeat" }, empty)).toBe(false);
    expect(
      draftSatisfies(
        { kind: "fightingStyleFeat" },
        { ...empty, fightingStyleFeat: { type: "takeFeat", featId: "defense", slot: "fightingStyle" } },
      ),
    ).toBe(true);
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

  it("newSpells also requires the meta.cantrips count of cantripsLearned (#1131)", () => {
    // Cleric 3→4: count 0, cantrips 1 — needs one cantrip and nothing else.
    const cantripOnly: LevelUpStep = { kind: "newSpells", count: 0, meta: { cantrips: 1 } };
    expect(draftSatisfies(cantripOnly, empty)).toBe(false);
    expect(
      draftSatisfies(cantripOnly, { ...empty, cantripsLearned: [{ type: "learnSpell", spellId: "c1" }] }),
    ).toBe(true);

    // Warlock 3→4: 1 spell AND 1 cantrip — the spell alone is not enough.
    const both: LevelUpStep = { kind: "newSpells", count: 1, meta: { cantrips: 1, canSwap: true } };
    expect(
      draftSatisfies(both, { ...empty, spellsLearned: [{ type: "learnSpell", spellId: "s1" }] }),
    ).toBe(false);
    expect(
      draftSatisfies(both, {
        ...empty,
        spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
        cantripsLearned: [{ type: "learnSpell", spellId: "c1" }],
      }),
    ).toBe(true);
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

describe("applySubclassPick (#1323)", () => {
  const m1 = { type: "learnManeuver" as const, maneuverId: "m1" };
  const m2 = { type: "learnManeuver" as const, maneuverId: "m2" };
  const t1 = { type: "learnToolProficiency" as const, name: "Smith's Tools" };
  const c1 = { type: "learnSubclassChoice" as const, choiceKey: "huntersPrey", optionId: "o1" };

  it("returns the same draft object when the subclass is unchanged", () => {
    const d: LevelUpDraft = { hp: { method: "average" }, subclassId: "bm" };
    expect(applySubclassPick(d, "bm")).toBe(d);
  });

  it("clears dependent picks when moving to a subclass with nothing stashed", () => {
    const d: LevelUpDraft = {
      hp: { method: "average" },
      subclassId: "bm",
      maneuvers: [m1, m2],
      toolProficiencies: [t1],
    };
    // Vacuity guard (A2 is only meaningful if the seed is non-empty): A3 below
    // confirms this same seed survives into the stash intact.
    expect(d.maneuvers).toHaveLength(2);

    const next = applySubclassPick(d, "champ");
    expect(next.maneuvers).toBeUndefined();
    expect(next.toolProficiencies).toBeUndefined();
    expect(next.subclassChoices).toBeUndefined();
  });

  it("stashes the outgoing subclass's dependent picks under its id", () => {
    const d: LevelUpDraft = {
      hp: { method: "average" },
      subclassId: "bm",
      maneuvers: [m1, m2],
      toolProficiencies: [t1],
    };
    const next = applySubclassPick(d, "champ");
    expect(next.dependentPicksBySubclass?.bm?.maneuvers).toEqual([m1, m2]);
    expect(next.dependentPicksBySubclass?.bm?.toolProficiencies).toEqual([t1]);
  });

  it("restores the incoming subclass's stashed picks on return, including subclassChoices", () => {
    const d: LevelUpDraft = {
      hp: { method: "average" },
      subclassId: "bm",
      maneuvers: [m1, m2],
      toolProficiencies: [t1],
      subclassChoices: [c1],
    };
    const away = applySubclassPick(d, "champ");
    const back = applySubclassPick(away, "bm");
    expect(back.maneuvers).toEqual([m1, m2]);
    expect(back.toolProficiencies).toEqual([t1]);
    expect(back.subclassChoices).toEqual([c1]);
  });

  it("keeps each subclass's picks in its own bucket across A→B→A→B", () => {
    const start: LevelUpDraft = { hp: { method: "average" }, subclassId: "bm", maneuvers: [m1] };
    const toChamp = applySubclassPick(start, "champ");
    const withToolProf = { ...toChamp, toolProficiencies: [t1] };
    const backToBm = applySubclassPick(withToolProf, "bm");
    expect(backToBm.maneuvers).toEqual([m1]);
    expect(backToBm.toolProficiencies).toBeUndefined();

    const backToChamp = applySubclassPick(backToBm, "champ");
    expect(backToChamp.toolProficiencies).toEqual([t1]);
    expect(backToChamp.maneuvers).toBeUndefined();
  });

  it("creates no stash bucket for the first subclass pick", () => {
    const d: LevelUpDraft = { hp: { method: "average" } };
    // Must be toEqual({}), not toBeUndefined() — a bucket-write condition that
    // fires unconditionally (even from no prior subclass) would pass a
    // toBeUndefined() check here just as readily as correct code (M4).
    expect(applySubclassPick(d, "bm").dependentPicksBySubclass).toEqual({});
  });

  // #1421: behavioural stand-in for "SUBCLASS_DEPENDENT_KEYS still contains
  // exactly the three" — the constant is module-private, so this asserts the
  // externally-visible contract instead of the private list itself.
  it("clears only the subclass-dependent keys, never the spell fields", () => {
    const d: LevelUpDraft = {
      hp: { method: "average" },
      subclassId: "bm",
      maneuvers: [m1],
      toolProficiencies: [t1],
      subclassChoices: [c1],
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      cantripsLearned: [{ type: "learnSpell", spellId: "c1" }],
      spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }],
    };
    const next = applySubclassPick(d, "champ");
    expect(next.maneuvers).toBeUndefined();
    expect(next.toolProficiencies).toBeUndefined();
    expect(next.subclassChoices).toBeUndefined();
    expect(next.spellsLearned).toEqual([{ type: "learnSpell", spellId: "s1" }]);
    expect(next.cantripsLearned).toEqual([{ type: "learnSpell", spellId: "c1" }]);
    expect(next.spellsForgotten).toEqual([{ type: "forgetSpell", entryId: "e1" }]);
  });
});

describe("pruneDraftToPlan (#1421)", () => {
  const hp: LevelUpDraft["hp"] = { method: "average" };
  const m1 = { type: "learnManeuver" as const, maneuverId: "m1" };
  const t1 = { type: "learnToolProficiency" as const, name: "Smith's Tools" };

  it("drops the three spell fields when the plan has no newSpells step", () => {
    const steps: LevelUpStep[] = [{ kind: "hitPoints" }, { kind: "review" }];
    const draft: LevelUpDraft = {
      hp,
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      cantripsLearned: [{ type: "learnSpell", spellId: "c1" }],
      spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }],
    };
    const next = pruneDraftToPlan(draft, steps);
    expect(next.spellsLearned).toBeUndefined();
    expect(next.cantripsLearned).toBeUndefined();
    expect(next.spellsForgotten).toBeUndefined();
  });

  it("keeps all three spell fields when a newSpells step is present (a full caster's subclass switch)", () => {
    const steps: LevelUpStep[] = [
      { kind: "hitPoints" },
      { kind: "newSpells", count: 2, meta: { cantrips: 1, canSwap: true } },
      { kind: "review" },
    ];
    const draft: LevelUpDraft = {
      hp,
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      cantripsLearned: [{ type: "learnSpell", spellId: "c1" }],
      spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }],
    };
    const next = pruneDraftToPlan(draft, steps);
    expect(next.spellsLearned).toEqual(draft.spellsLearned);
    expect(next.cantripsLearned).toEqual(draft.cantripsLearned);
    expect(next.spellsForgotten).toEqual(draft.spellsForgotten);
  });

  it("returns the same draft object when nothing needs pruning", () => {
    const steps: LevelUpStep[] = [{ kind: "hitPoints" }, { kind: "review" }];
    const d: LevelUpDraft = { hp };
    expect(pruneDraftToPlan(d, steps)).toBe(d);
  });

  it("never drops dependentPicksBySubclass, even when every other field is pruned", () => {
    const steps: LevelUpStep[] = [{ kind: "hitPoints" }, { kind: "review" }];
    const draft: LevelUpDraft = {
      hp,
      maneuvers: [m1],
      dependentPicksBySubclass: { bm: { maneuvers: [m1] } },
    };
    const next = pruneDraftToPlan(draft, steps);
    // Vacuity guard: prove something was actually dropped, not just untouched.
    expect(next.maneuvers).toBeUndefined();
    expect(next.dependentPicksBySubclass).toEqual({ bm: { maneuvers: [m1] } });
  });

  it("drops advancement, fightingStyleFeat, maneuvers and toolProficiencies when their step kinds are absent (#1148)", () => {
    const steps: LevelUpStep[] = [{ kind: "hitPoints" }, { kind: "review" }];
    const draft: LevelUpDraft = {
      hp,
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      fightingStyleFeat: { type: "takeFeat", featId: "defense", slot: "fightingStyle" },
      maneuvers: [m1],
      toolProficiencies: [t1],
    };
    const next = pruneDraftToPlan(draft, steps);
    expect(next.advancement).toBeUndefined();
    expect(next.fightingStyleFeat).toBeUndefined();
    expect(next.maneuvers).toBeUndefined();
    expect(next.toolProficiencies).toBeUndefined();
  });

  it("keeps advancement, fightingStyleFeat, maneuvers and toolProficiencies when their step kinds are present", () => {
    // Note: the singular step kind `toolProficiency` licenses the plural
    // draft field `toolProficiencies`.
    const steps: LevelUpStep[] = [
      { kind: "hitPoints" },
      { kind: "advancement", count: 1 },
      { kind: "fightingStyleFeat" },
      { kind: "maneuvers", count: 3 },
      { kind: "toolProficiency", count: 1 },
      { kind: "review" },
    ];
    const draft: LevelUpDraft = {
      hp,
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      fightingStyleFeat: { type: "takeFeat", featId: "defense", slot: "fightingStyle" },
      maneuvers: [m1],
      toolProficiencies: [t1],
    };
    const next = pruneDraftToPlan(draft, steps);
    expect(next.advancement).toEqual(draft.advancement);
    expect(next.fightingStyleFeat).toEqual(draft.fightingStyleFeat);
    expect(next.maneuvers).toEqual([m1]);
    expect(next.toolProficiencies).toEqual([t1]);
  });

  it("drops only the subclassChoices entries whose choiceKey has no matching step meta.key", () => {
    const steps: LevelUpStep[] = [
      { kind: "hitPoints" },
      { kind: "subclassChoice", count: 1, meta: { key: "metamagic", label: "Metamagic" } },
      { kind: "review" },
    ];
    const draft: LevelUpDraft = {
      hp,
      subclassChoices: [
        { type: "learnSubclassChoice", choiceKey: "metamagic", optionId: "o1" },
        { type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "o2" },
      ],
    };
    const next = pruneDraftToPlan(draft, steps);
    expect(next.subclassChoices).toEqual([{ type: "learnSubclassChoice", choiceKey: "metamagic", optionId: "o1" }]);
  });

  it("drops the subclassChoices field entirely when no entry survives", () => {
    const steps: LevelUpStep[] = [{ kind: "hitPoints" }, { kind: "review" }];
    const draft: LevelUpDraft = {
      hp,
      subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "o2" }],
    };
    const next = pruneDraftToPlan(draft, steps);
    expect("subclassChoices" in next).toBe(false);
  });

  it("keeps the subclassChoices a subclassChoice step wrote (#1422 cross-check)", () => {
    const step: LevelUpStep = { kind: "subclassChoice", count: 1, meta: { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "ranger-conclave" } };
    const config = choiceConfigForStep(step);
    const written = config!.select({}, ["o1"]);
    const draft: LevelUpDraft = { hp, ...written };
    const next = pruneDraftToPlan(draft, [step]);
    expect(next.subclassChoices).toEqual(draft.subclassChoices);
  });

  // Regression guard: the rebuild path must not manufacture a fresh
  // subclassChoices array when every entry survives — only spellsLearned
  // (a different field) is what should force the rebuild here.
  it("preserves the subclassChoices array reference when another field is pruned but every choice survives", () => {
    const steps: LevelUpStep[] = [
      { kind: "hitPoints" },
      { kind: "subclassChoice", count: 1, meta: { key: "huntersPrey", label: "Hunter's Prey" } },
      { kind: "review" },
    ];
    const subclassChoices = [{ type: "learnSubclassChoice" as const, choiceKey: "huntersPrey", optionId: "o1" }];
    const draft: LevelUpDraft = {
      hp,
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      subclassChoices,
    };
    const next = pruneDraftToPlan(draft, steps);
    // Vacuity guard: prove the rebuild path actually ran (a different field
    // was in fact pruned) — otherwise this test would trivially pass via the
    // same-reference early return, proving nothing about the rebuild path.
    expect(next.spellsLearned).toBeUndefined();
    expect(next.subclassChoices).toBe(subclassChoices);
  });
});
