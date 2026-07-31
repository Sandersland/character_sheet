// #1546 Part B-i: the non-vacuity proof for the featureRows carrier threaded
// onto TargetClassEntry/resolveLevelUpPlan. This is a PURE unit test (no DB)
// deliberately using a test-only stat/row rather than Battle Master content —
// B-i must not depend on B-ii's rows existing (they don't yet: fighter.ts's
// deriveExtras/resourceFn still supply Battle Master's maneuverChoiceCount/
// toolProfChoiceCount/pool, unaffected by this carrier).
//
// Why a spy on deriveResources, not a plan-output assertion: nothing in
// buildLevelUpPlan's candidate steps (hitPointsStep, advancementStep,
// subclassStep, choiceCountStep, fightingStyleFeatStep, subclassChoiceSteps,
// newSpellsStep) reads DerivedClassInfo.resources/.features — only
// ClassExtras fields (still code, via SubclassDefinition.deriveExtras) and
// subclassChoices (still code, via SubclassDefinition.choices). That is
// exactly level-up-plan.test.ts's "plan output byte-identical" central claim:
// the carrier reaching deriveResources is real (this file proves it), but it
// is a confirmed behavior no-op until #1546 Part B-ii adds a row-driven
// ClassExtras reader. So the carrier's arrival has to be proven by spying on
// the call it feeds, not by a step assertion — a step assertion would either
// be vacuous (nothing changes) or wrongly imply B-i changes plan output.
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

const deriveResourcesSpy = vi.fn();

vi.mock("@/lib/classes/class-features.js", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/classes/class-features.js")>();
  return {
    ...actual,
    deriveResources: (...args: Parameters<typeof actual.deriveResources>) => {
      deriveResourcesSpy(...args);
      return actual.deriveResources(...args);
    },
  };
});

const { buildLevelUpPlan } = await import("@/lib/leveling/level-up-plan.js");
const { resolveLevelUpPlan } = await import("@/lib/leveling/level-up-submission.js");
type LevelUpPlanCharacter = import("@/lib/leveling/level-up-plan.js").LevelUpPlanCharacter;
type TargetClassEntry = import("@/lib/leveling/level-up-plan.js").TargetClassEntry;

const ABILITIES = { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 10 };
const ANY_DIE = "d10";

function char(name: string, level: number, subclass: string | null = null): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name, level, subclass }], edition: "EDITION_2024" };
}

// Test-only descriptor row — deliberately NOT Battle Master content (no
// resourceKey/derivedStat matching anything a reader consumes yet). Its only
// job is to be a distinguishable, non-empty ClassFeatureRow this test can
// assert arrived at deriveResources byte-for-byte.
const TEST_CLASS_ROW: ClassFeatureRow = {
  name: "Test-Only Class Row (#1546 B-i)",
  level: 1,
  description: "Non-vacuity fixture — never seeded, never read by any product reader.",
  edition: "EDITION_2024",
};
const TEST_SUBCLASS_ROW: ClassFeatureRow = {
  name: "Test-Only Subclass Row (#1546 B-i)",
  level: 3,
  description: "Non-vacuity fixture — never seeded, never read by any product reader.",
  edition: "EDITION_2024",
};
const TEST_PICKED_ROW: ClassFeatureRow = {
  name: "Test-Only Picked Subclass Row (#1546 B-i)",
  level: 3,
  description: "The NOT-YET-COMMITTED ?subclassId= pick's own row — must win over target's own (absent) subclassFeatureRows.",
  edition: "EDITION_2024",
};

afterEach(() => {
  deriveResourcesSpy.mockClear();
});

describe("buildLevelUpPlan — featureRows carrier reaches deriveResources (#1546 Part B-i)", () => {
  it("threads target.classFeatureRows/subclassFeatureRows through — the PERSISTED path", () => {
    const target: TargetClassEntry = {
      name: "fighter",
      newLevel: 5,
      subclass: "test-only-subclass",
      hitDie: ANY_DIE,
      classFeatureRows: [TEST_CLASS_ROW],
      subclassFeatureRows: [TEST_SUBCLASS_ROW],
    };
    buildLevelUpPlan(char("fighter", 4, "test-only-subclass"), target);

    expect(deriveResourcesSpy).toHaveBeenCalled();
    for (const call of deriveResourcesSpy.mock.calls) {
      const featureRows = call[5]; // deriveResources(name, subclass, level, abilityScores, profBonus, featureRows, edition)
      expect(featureRows).toEqual({ classRows: [TEST_CLASS_ROW], subclassRows: [TEST_SUBCLASS_ROW] });
    }
  });

  it("an absent carrier (no resolveLevelUpContext caller, e.g. a bare test fixture) threads empty arrays, never undefined", () => {
    const target: TargetClassEntry = { name: "fighter", newLevel: 2, subclass: null, hitDie: ANY_DIE };
    buildLevelUpPlan(char("fighter", 1), target);

    expect(deriveResourcesSpy).toHaveBeenCalled();
    for (const call of deriveResourcesSpy.mock.calls) {
      expect(call[5]).toEqual({ classRows: [], subclassRows: [] });
    }
  });
});

describe("resolveLevelUpPlan — the re-plan (?subclassId=) path carries the PICKED rows, not target's own (#1546 Part B-i)", () => {
  it("the re-plan splice uses pickedSubclassFeatureRows, overriding target's (absent) subclassFeatureRows", () => {
    // Fighter 2→3 with no subclass chosen yet — target carries its own
    // classFeatureRows (persisted, real) but subclassFeatureRows is absent
    // (no subclass committed). chosenSubclassName + pickedSubclassFeatureRows
    // model the ?subclassId= re-plan (level-up.ts's GET /plan route).
    const target: TargetClassEntry = {
      name: "fighter",
      newLevel: 3,
      subclass: null,
      hitDie: ANY_DIE,
      classFeatureRows: [TEST_CLASS_ROW],
    };
    resolveLevelUpPlan(char("fighter", 2), target, "test-only-subclass", [TEST_PICKED_ROW]);

    expect(deriveResourcesSpy).toHaveBeenCalled();
    // The base-plan calls (subclass still null) see NO subclass rows; the
    // re-plan calls (subclass spliced to "test-only-subclass") see the
    // PICKED row, never target's own (there is none to carry — that's what
    // "not yet chosen" means).
    const sawPickedRow = deriveResourcesSpy.mock.calls.some(
      (call) => (call[5] as { subclassRows: ClassFeatureRow[] }).subclassRows.some((r) => r.name === TEST_PICKED_ROW.name),
    );
    expect(sawPickedRow).toBe(true);
    // classFeatureRows carries through unchanged on every call — the re-plan
    // splice only overrides subclass/subclassFeatureRows.
    for (const call of deriveResourcesSpy.mock.calls) {
      expect((call[5] as { classRows: ClassFeatureRow[] }).classRows).toEqual([TEST_CLASS_ROW]);
    }
  });
});
