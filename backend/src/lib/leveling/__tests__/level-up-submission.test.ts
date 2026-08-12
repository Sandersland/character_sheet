import { describe, it, expect } from "vitest";

import { BATTLE_MASTER_ROWS } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
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
import { ELDRITCH_KNIGHT as ELDRITCH_KNIGHT_CASTER_REF } from "@/lib/srd/__tests__/third-caster.fixture.js";

const ABILITIES = { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 10 };

function char(
  name: string,
  level: number,
  subclass: string | null = null,
  spellEntries?: LevelUpPlanCharacter["spellEntries"],
): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name, level, subclass }], spellEntries, edition: "EDITION_2024" };
}

// This suite validates SUBMISSIONS against step counts and never reads the HP
// meta, so the die is required (#1380) but arbitrary here. Anything asserting on
// HP numbers belongs in level-up-plan.test.ts, where each case names its own die.
const ANY_DIE = "d10";

function target(name: string, newLevel: number, subclass: string | null = null, subclassLevel?: number): TargetClassEntry {
  return { name, newLevel, subclass, subclassLevel, hitDie: ANY_DIE };
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
    // #1546 Part B-ii: maneuverChoiceCount/toolProfChoiceCount are ROW-driven
    // now — the picked subclass's own rows must be supplied, mirroring what
    // resolveLevelUpContext resolves via the ?subclassId= pick's
    // Subclass.findUnique (level-up-transaction.ts's resolvePickedSubclass).
    const steps = resolveLevelUpPlan(char("fighter", 2), target("fighter", 3, null), "battle master", BATTLE_MASTER_ROWS);
    expect(steps.map((s) => s.kind)).toEqual(["hitPoints", "subclass", "maneuvers", "toolProficiency", "review"]);
    const replan = buildLevelUpPlan(char("fighter", 2), { ...target("fighter", 3, "battle master"), subclassFeatureRows: BATTLE_MASTER_ROWS });
    expect(steps.filter((s) => s.kind !== "subclass")).toEqual(replan);
  });

  // Review finding 3: the re-plan branch specifically for a THIRD CASTER —
  // target.subclassCasterRef is null (no persisted subclass yet, same as the
  // Battle Master case above), and the newSpells step can only exist because
  // resolveLevelUpPlan threads the 5th param, chosenSubclassCasterRef, into
  // the replanned target. Without that threading this step silently vanishes
  // (newSpellsStep's own early-return: count<=0 && cantrips<=0 && !canSwap) —
  // exactly the live bug shape a missed `subclassCasterRef` regression takes.
  it("Fighter 2→3 picking Eldritch Knight for the FIRST time re-plans and emits a newSpells step via chosenSubclassCasterRef", () => {
    const steps = resolveLevelUpPlan(
      char("fighter", 2),
      target("fighter", 3, null),
      "Eldritch Knight",
      [],
      ELDRITCH_KNIGHT_CASTER_REF,
    );
    expect(steps.map((s) => s.kind)).toEqual(["hitPoints", "subclass", "newSpells", "review"]);
    const newSpells = steps.find((s) => s.kind === "newSpells")!;
    expect(newSpells.count).toBeGreaterThan(0);
    expect(newSpells.meta?.spellLists).toEqual(["wizard"]);

    // Omitting chosenSubclassCasterRef (undefined, the pre-#1531-fix shape)
    // must NOT produce the same plan — the newSpells step depends on it.
    const withoutRef = resolveLevelUpPlan(char("fighter", 2), target("fighter", 3, null), "Eldritch Knight", []);
    expect(withoutRef.map((s) => s.kind)).toEqual(["hitPoints", "subclass", "review"]);
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
        // #1546 Part B-ii: the plan can't surface a maneuvers step at all
        // without the picked subclass's row-driven maneuverChoiceCount.
        BATTLE_MASTER_ROWS,
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
    const steps = validateLevelUpSubmission(char("sorcerer", 5, null, KNOWN), target("sorcerer", 6), null, {
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
      validateLevelUpSubmission(char("sorcerer", 5, null, [{ id: "e1", level: 1, source: null }, { id: "e2", level: 1, source: null }]), target("sorcerer", 6), null, {
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

  it("rejects a Ranger swap — 2024 re-prepare classes have no level-up newSpells step", () => {
    expect(() =>
      validateLevelUpSubmission(char("ranger", 4, null, KNOWN), target("ranger", 5), null, {
        ...base,
        spellsLearned: [learn("s1")],
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/does not allow swapping|does not grant new spells/i);
  });

  it("rejects forgetting a cantrip entry (level 0)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 5, null, [{ id: "e1", level: 0, source: null }]), target("sorcerer", 6), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/cannot swap/i);
  });

  it("rejects forgetting a subclass-granted entry (source set)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 5, null, [{ id: "e1", level: 1, source: "subclass" }]), target("sorcerer", 6), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
        spellsForgotten: [forget("e1")],
      }),
    ).toThrow(/cannot swap/i);
  });

  it("rejects forgetting an unknown entryId", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 5, null, KNOWN), target("sorcerer", 6), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
        spellsForgotten: [forget("nope")],
      }),
    ).toThrow(/cannot swap/i);
  });

  it("rejects a count-1 learn level with a forget but only 1 learn (net mismatch)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 5, null, KNOWN), target("sorcerer", 6), null, {
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

// #1503: the choose-N swap for Way of the Four Elements' fourElementsDisciplines
// choice — the first choice whose swapCadence resolves "onLevelUp"
// (subclassChoiceSwapCadence). Same shape as the known-spell swap suite above,
// scoped per choiceKey instead of globally.
describe("validateLevelUpSubmission — choose-N swap (#1503, Way of the Four Elements)", () => {
  function char4e(level: number): LevelUpPlanCharacter {
    return { abilityScores: ABILITIES, classEntries: [{ name: "monk", level, subclass: "way of the four elements" }], edition: "EDITION_2014" };
  }
  const t4e = (newLevel: number) => target("monk", newLevel, "way of the four elements");
  const learnDisc = (optionId: string): NonNullable<LevelUpSubmission["subclassChoices"]>[number] => ({
    type: "learnSubclassChoice",
    choiceKey: "fourElementsDisciplines",
    optionId,
  });
  const forgetDisc = (entryId: string): NonNullable<LevelUpSubmission["subclassChoicesForgotten"]>[number] => ({
    type: "forgetSubclassChoice",
    choiceKey: "fourElementsDisciplines",
    entryId,
  });
  const base = { target: { kind: "existing", classEntryId: "x" } as const, hp: { method: "average" as const } };

  it("5→6 accepts a swap: 2 learns + 1 forget nets to the step's count (1)", () => {
    const steps = validateLevelUpSubmission(char4e(5), t4e(6), null, {
      ...base,
      subclassChoices: [learnDisc("opt-1"), learnDisc("opt-2")],
      subclassChoicesForgotten: [forgetDisc("entry-1")],
    });
    expect(kinds(steps)).toEqual(["hitPoints", "subclassChoice", "review"]);
  });

  it("rejects two forgets for the same key", () => {
    expect(() =>
      validateLevelUpSubmission(char4e(10), t4e(11), null, {
        ...base,
        subclassChoices: [learnDisc("opt-1"), learnDisc("opt-2"), learnDisc("opt-3")],
        subclassChoicesForgotten: [forgetDisc("entry-1"), forgetDisc("entry-2")],
      }),
    ).toThrow(/at most one/i);
  });

  // #1101's own Wizard test picks a case where the NET matches the step's
  // expected count exactly, so assertCounts passes silently and
  // assert(SubclassChoice)Forgets is what actually rejects — a forget-only
  // submission that also fails the count check would be rejected by
  // assertCounts first with a less specific message. Monk 6→7 is neither an
  // ASI level (4/8/12/16/19) nor a discipline-growth level (next threshold
  // 11), so no subclassChoice step exists for fourElementsDisciplines at all.
  it("rejects a forget on a level with no subclassChoice step for that key at all (no new discipline this level)", () => {
    expect(() =>
      validateLevelUpSubmission(char4e(6), t4e(7), null, {
        ...base,
        subclassChoicesForgotten: [forgetDisc("entry-1")],
      }),
    ).toThrow(/does not allow swapping/i);
  });

  it("rejects a forget for a choose-N choice whose swapCadence is NOT onLevelUp (Hunter's Prey)", () => {
    expect(() =>
      validateLevelUpSubmission(
        { abilityScores: ABILITIES, classEntries: [{ name: "ranger", level: 6, subclass: "hunter" }], edition: "EDITION_2024" },
        target("ranger", 7, "hunter"),
        null,
        {
          ...base,
          // 2 learns - 1 forget = net 1, matching the step's expected count
          // (1) exactly, so assertCounts passes and the swap-cadence guard is
          // what actually rejects this.
          subclassChoices: [
            { type: "learnSubclassChoice", choiceKey: "defensiveTactics", optionId: "opt-1" },
            { type: "learnSubclassChoice", choiceKey: "defensiveTactics", optionId: "opt-2" },
          ],
          subclassChoicesForgotten: [{ type: "forgetSubclassChoice", choiceKey: "defensiveTactics", entryId: "entry-1" }],
        },
      ),
    ).toThrow(/does not allow swapping/i);
  });

  it("rejects a net mismatch (1 learn, 1 forget, but step expects 1 net — i.e. 2 learns needed)", () => {
    expect(() =>
      validateLevelUpSubmission(char4e(5), t4e(6), null, {
        ...base,
        subclassChoices: [learnDisc("opt-1")],
        subclassChoicesForgotten: [forgetDisc("entry-1")],
      }),
    ).toThrow(/fourElementsDisciplines choices/i);
  });
});

// #1516: the maneuver swap — "Each time you learn new maneuvers, you can also
// replace one maneuver you know with a different one" (PHB'14 Battle Master
// p.73; SRD 5.2 carries the equivalent grant), unconditional whenever the
// "maneuvers" step exists (choiceCountStep, level-up-plan.ts). Same shape as
// the choose-N swap suite above, scoped to the single "maneuvers" step.
describe("validateLevelUpSubmission — maneuver swap (#1516, Battle Master)", () => {
  // maneuverChoiceCount thresholds (BATTLE_MASTER_ROWS): 3@3, 5@7, 7@10, 9@15.
  const bmTarget = (newLevel: number): TargetClassEntry => ({
    ...target("fighter", newLevel, "battle master"),
    subclassFeatureRows: BATTLE_MASTER_ROWS,
  });
  const charBM = (level: number): LevelUpPlanCharacter => char("fighter", level, "battle master");
  const learnManeuver = (id: string): NonNullable<LevelUpSubmission["maneuvers"]>[number] => ({ type: "learnManeuver", maneuverId: id });
  const forgetManeuver = (entryId: string): NonNullable<LevelUpSubmission["maneuversForgotten"]>[number] => ({ type: "forgetManeuver", entryId });
  const base = { target: { kind: "existing", classEntryId: "x" } as const, hp: { method: "average" as const } };

  it("6→7 (delta 2) accepts a swap: 3 learns + 1 forget nets to the step's count (2)", () => {
    const steps = validateLevelUpSubmission(charBM(6), bmTarget(7), null, {
      ...base,
      maneuvers: [learnManeuver("m1"), learnManeuver("m2"), learnManeuver("m3")],
      maneuversForgotten: [forgetManeuver("entry-1")],
    });
    expect(kinds(steps)).toEqual(["hitPoints", "maneuvers", "review"]);
  });

  it("rejects two forgets in one level-up", () => {
    expect(() =>
      validateLevelUpSubmission(charBM(6), bmTarget(7), null, {
        ...base,
        maneuvers: [learnManeuver("m1"), learnManeuver("m2"), learnManeuver("m3"), learnManeuver("m4")],
        maneuversForgotten: [forgetManeuver("entry-1"), forgetManeuver("entry-2")],
      }),
    ).toThrow(/at most one/i);
  });

  // Fighter-3→4 is not a maneuver-growth level (3 at L3, still 3 at L4) — no
  // "maneuvers" step exists at all, so PHB'14's "each time you learn new
  // maneuvers" condition never fires here. (Fighter 4 is also an ASI level,
  // so `advancement` is included to isolate the forget rejection.)
  it("rejects a forget on a level granting no new maneuvers (3→4)", () => {
    expect(() =>
      validateLevelUpSubmission(charBM(3), bmTarget(4), null, {
        ...base,
        advancement: takeAsi,
        maneuversForgotten: [forgetManeuver("entry-1")],
      }),
    ).toThrow(/does not allow swapping a maneuver/i);
  });

  it("rejects a net mismatch (1 learn, 1 forget, but the step expects 2 net)", () => {
    expect(() =>
      validateLevelUpSubmission(charBM(6), bmTarget(7), null, {
        ...base,
        maneuvers: [learnManeuver("m1")],
        maneuversForgotten: [forgetManeuver("entry-1")],
      }),
    ).toThrow(/expected 2 maneuvers/i);
  });

  // Code-review finding: assertCounts' negative-net branch (a forget with NO
  // replacement learn at all) hardcoded "spell" for every domain — a Battle
  // Master forgetting with zero learns got "replacement spell", not
  // "replacement maneuver". swapUnitNoun keys the message off the step kind.
  it("names the maneuver (not 'spell') when a forget has no replacement learn at all", () => {
    expect(() =>
      validateLevelUpSubmission(charBM(6), bmTarget(7), null, {
        ...base,
        maneuversForgotten: [forgetManeuver("entry-1")],
      }),
    ).toThrow(/replacement maneuver for every maneuver you swap out/i);
  });

  // Code-review finding: on a no-growth level (no "maneuvers" step at all —
  // canSwap is never true), 2 forgets must still say "does not allow
  // swapping", not "at most one" (which wrongly implies exactly one forget
  // WOULD be legal there). assertManeuverForgets checks canSwap before the
  // length>1 guard for exactly this reason.
  it("rejects two forgets on a level granting no new maneuvers with the cadence message, not 'at most one'", () => {
    expect(() =>
      validateLevelUpSubmission(charBM(3), bmTarget(4), null, {
        ...base,
        advancement: takeAsi,
        maneuversForgotten: [forgetManeuver("entry-1"), forgetManeuver("entry-2")],
      }),
    ).toThrow(/does not allow swapping a maneuver/i);
  });
});

describe("validateLevelUpSubmission — new cantrips (#1131)", () => {
  const learn = (spellId: string): NonNullable<LevelUpSubmission["spellsLearned"]>[number] => ({ type: "learnSpell", spellId });
  const forget = (entryId: string): NonNullable<LevelUpSubmission["spellsForgotten"]>[number] => ({ type: "forgetSpell", entryId });
  const base = { target: { kind: "existing", classEntryId: "x" } as const, hp: { method: "average" as const } };

  it("accepts the exact spell + cantrip counts (Wizard 9→10: 2 spells, 1 cantrip)", () => {
    const steps = validateLevelUpSubmission(char("wizard", 9), target("wizard", 10), null, {
      ...base,
      spellsLearned: [learn("s1"), learn("s2")],
      cantripsLearned: [learn("c1")],
    });
    expect(kinds(steps)).toContain("newSpells");
  });

  it("rejects a missing cantrip", () => {
    expect(() =>
      validateLevelUpSubmission(char("wizard", 9), target("wizard", 10), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
      }),
    ).toThrow(/cantrip/i);
  });

  it("rejects an extra cantrip (2 where 1 expected)", () => {
    expect(() =>
      validateLevelUpSubmission(char("wizard", 9), target("wizard", 10), null, {
        ...base,
        spellsLearned: [learn("s1"), learn("s2")],
        cantripsLearned: [learn("c1"), learn("c2")],
      }),
    ).toThrow(/cantrip/i);
  });

  it("accepts a cantrips-only step (Cleric 9→10: 0 spells, 1 cantrip)", () => {
    const steps = validateLevelUpSubmission(char("cleric", 9), target("cleric", 10), null, {
      ...base,
      cantripsLearned: [learn("c1")],
    });
    expect(kinds(steps)).toContain("newSpells");
  });

  it("rejects cantripsLearned on a level whose newSpells step grants no cantrips (Sorcerer 5→6)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 5), target("sorcerer", 6), null, {
        ...base,
        spellsLearned: [learn("s1")],
        cantripsLearned: [learn("c1")],
      }),
    ).toThrow(/cantrip/i);
  });

  it("rejects cantripsLearned when there is no newSpells step at all (Fighter 7→8)", () => {
    expect(() =>
      validateLevelUpSubmission(char("fighter", 7, "champion"), target("fighter", 8, "champion"), null, {
        ...base,
        advancement: takeAsi,
        cantripsLearned: [learn("c1")],
      }),
    ).toThrow(/cantrip/i);
  });

  it("a cantrip never offsets a swap forget (Sorcerer 13→14 swap-only)", () => {
    expect(() =>
      validateLevelUpSubmission(char("sorcerer", 13, null, [{ id: "e1", level: 1, source: null }]), target("sorcerer", 14), null, {
        ...base,
        spellsForgotten: [forget("e1")],
        cantripsLearned: [learn("c1")],
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
      // #1546 Part B-ii: the picked subclass's own rows (mirrors the two
      // fixes above in this file).
      BATTLE_MASTER_ROWS,
    );
    // Effective plan mirrors buildLevelUpPlan for the chosen subclass, with the
    // subclass step spliced after hitPoints (no advancement) and before maneuvers.
    expect(kinds(steps)).toEqual(["hitPoints", "subclass", "maneuvers", "toolProficiency", "review"]);
    const replan = buildLevelUpPlan(char("fighter", 2), { ...target("fighter", 3, "battle master"), subclassFeatureRows: BATTLE_MASTER_ROWS });
    expect(steps.filter((s) => s.kind !== "subclass")).toEqual(replan);
  });
});
