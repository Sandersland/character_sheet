// #1546 Part B-i proved the featureRows carrier reaches deriveResources by
// spying on the call (a plan-output assertion was vacuous by construction
// then: nothing in buildLevelUpPlan's candidate steps read anything the
// carrier fed, since Battle Master's ClassExtras were still code —
// SubclassDefinition.deriveExtras). #1546 Part B-ii retires that spy:
// Combat Superiority/Student of War's maneuverChoiceCount/toolProfChoiceCount
// are now ROW-driven (registry.ts's deriveRowExtras), so choiceCountStep
// genuinely reads them — the carrier's arrival is observable through REAL
// plan output now, and a standing `vi.mock` of a domain module is no longer
// needed (nor wanted as precedent — this was the first one in backend/src).
//
// Uses BATTLE_MASTER_ROWS (test-feature-rows.fixture.ts) — the same rows
// prisma/seed/fighter-features.ts seeds — rather than a test-only inert row,
// because the whole point now is proving the ceremony's maneuvers/
// toolProficiency steps survive the code -> rows flip end to end, on both
// the persisted-subclass FK path (CharacterClassEntry.subclassRef) and the
// not-yet-committed `?subclassId=` re-plan FK path (Subclass.findUnique) —
// the exact two carriers B-i threaded (level-up-transaction.ts).
import type { RulesEdition } from "@character-sheet/shared-types";
import { describe, expect, it } from "vitest";

import { BATTLE_MASTER_ROWS, FIGHTER_BASE_ROWS } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import { buildLevelUpPlan, type LevelUpPlanCharacter, type LevelUpStep, type TargetClassEntry } from "@/lib/leveling/level-up-plan.js";
import { resolveLevelUpPlan } from "@/lib/leveling/level-up-submission.js";

const ABILITIES = { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 10 };
const ANY_DIE = "d10";
const EDITIONS: RulesEdition[] = ["EDITION_2014", "EDITION_2024"];

function char(level: number, edition: RulesEdition, subclass: string | null = null): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name: "fighter", level, subclass }], edition };
}

function stepsByKind(steps: LevelUpStep[], kind: LevelUpStep["kind"]): LevelUpStep | undefined {
  return steps.find((s) => s.kind === kind);
}

describe.each(EDITIONS)("buildLevelUpPlan — the PERSISTED subclass FK path carries real Battle Master rows (%s, #1546 Part B-ii)", (edition) => {
  it("fighter 2 -> 3: subclass already persisted at the grant level still gets maneuvers 3 + toolProficiency 1", () => {
    // Edge case for the persisted FK (CharacterClassEntry.subclassRef) — the
    // common flow chooses the subclass VIA the re-plan below, but
    // resolveLevelUpContext's TARGET_ENTRY_SELECT carries subclassRef.features
    // regardless of what level the persisted subclass happens to be at, so
    // this must resolve correctly too.
    const target: TargetClassEntry = {
      name: "fighter",
      newLevel: 3,
      subclass: "battle master",
      hitDie: ANY_DIE,
      classFeatureRows: FIGHTER_BASE_ROWS,
      subclassFeatureRows: BATTLE_MASTER_ROWS,
    };
    const steps = buildLevelUpPlan(char(2, edition, "battle master"), target);

    // #1516: canSwap rides the "maneuvers" step unconditionally whenever it
    // exists (PHB'14 Battle Master p.73 / SRD 5.2 equivalent).
    expect(stepsByKind(steps, "maneuvers")).toEqual({ kind: "maneuvers", count: 3, meta: { canSwap: true } });
    expect(stepsByKind(steps, "toolProficiency")).toEqual({ kind: "toolProficiency", count: 1 });
  });

  it("fighter 6 -> 7: an already-known Battle Master gets maneuvers 2 (5 - 3), no toolProficiency step (cap unchanged at 1)", () => {
    const target: TargetClassEntry = {
      name: "fighter",
      newLevel: 7,
      subclass: "battle master",
      hitDie: ANY_DIE,
      classFeatureRows: FIGHTER_BASE_ROWS,
      subclassFeatureRows: BATTLE_MASTER_ROWS,
    };
    const steps = buildLevelUpPlan(char(6, edition, "battle master"), target);

    expect(stepsByKind(steps, "maneuvers")).toEqual({ kind: "maneuvers", count: 2, meta: { canSwap: true } });
    expect(stepsByKind(steps, "toolProficiency")).toBeUndefined();
  });
});

describe.each(EDITIONS)("resolveLevelUpPlan — the ?subclassId= RE-PLAN FK path carries the PICKED Battle Master rows (%s, #1546 Part B-ii)", (edition) => {
  it("fighter 2 -> 3 with no subclass chosen yet: the re-plan splices subclass + maneuvers 3 + toolProficiency 1, in canonical order", () => {
    // No subclassFeatureRows on target — "not yet chosen" is exactly what
    // that absence means; the PICKED rows travel as resolveLevelUpPlan's own
    // parameter (pickedSubclassFeatureRows), never baked onto target.
    const target: TargetClassEntry = {
      name: "fighter",
      newLevel: 3,
      subclass: null,
      hitDie: ANY_DIE,
      classFeatureRows: FIGHTER_BASE_ROWS,
    };
    const steps = resolveLevelUpPlan(char(2, edition), target, "battle master", BATTLE_MASTER_ROWS);

    const kinds = steps.map((s) => s.kind);
    expect(kinds).toContain("subclass");
    expect(stepsByKind(steps, "maneuvers")).toEqual({ kind: "maneuvers", count: 3, meta: { canSwap: true } });
    expect(stepsByKind(steps, "toolProficiency")).toEqual({ kind: "toolProficiency", count: 1 });
    // Canonical order (KIND_ORDER, level-up-submission.ts): subclass before
    // maneuvers/toolProficiency, both before review.
    expect(kinds.indexOf("subclass")).toBeLessThan(kinds.indexOf("maneuvers"));
    expect(kinds.indexOf("maneuvers")).toBeLessThan(kinds.indexOf("toolProficiency"));
  });

  it("with no subclass chosen (subclassId omitted): just the subclass step, no maneuvers/toolProficiency yet — proves the re-plan only fires on a real pick", () => {
    const target: TargetClassEntry = {
      name: "fighter",
      newLevel: 3,
      subclass: null,
      hitDie: ANY_DIE,
      classFeatureRows: FIGHTER_BASE_ROWS,
    };
    const steps = resolveLevelUpPlan(char(2, edition), target, null, null);

    expect(steps.map((s) => s.kind)).toContain("subclass");
    expect(stepsByKind(steps, "maneuvers")).toBeUndefined();
    expect(stepsByKind(steps, "toolProficiency")).toBeUndefined();
  });
});

// The non-vacuity proof B-i's spy used to carry: an absent carrier (no
// resolveLevelUpContext caller, e.g. a bare pure-function call) must never
// throw, and a class/subclass with nothing row-driven still plans cleanly.
// See derivedAt's own comment (level-up-plan.ts) for the null-flip
// consequence #1546 Part B-ii introduces for Battle Master specifically —
// derive-resources-null-flip.test.ts covers that at the deriveResources layer
// directly (an empty carrier now genuinely returns null for Battle Master,
// where it used to return a code-authored object regardless of the carrier).
describe("buildLevelUpPlan — an absent carrier never throws and grants nothing (no regression from #1546 Part B-i's threading)", () => {
  it("a target with no classFeatureRows/subclassFeatureRows at all still plans a non-Battle-Master level-up cleanly", () => {
    const target: TargetClassEntry = { name: "fighter", newLevel: 2, subclass: null, hitDie: ANY_DIE };
    expect(() => buildLevelUpPlan(char(1, "EDITION_2024"), target)).not.toThrow();
    const steps = buildLevelUpPlan(char(1, "EDITION_2024"), target);
    expect(stepsByKind(steps, "maneuvers")).toBeUndefined();
    expect(stepsByKind(steps, "toolProficiency")).toBeUndefined();
  });
});
