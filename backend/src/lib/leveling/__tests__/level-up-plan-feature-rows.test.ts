// #1546 Part B-ii: uses BATTLE_MASTER_ROWS (the same rows prisma/seed/fighter-features.ts seeds), not an inert fixture, so this proves the ceremony's maneuvers/toolProficiency steps survive the code → rows flip end to end, on both the persisted-subclass FK path and the not-yet-committed `?subclassId=` re-plan FK path.
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
    // Edge case for the persisted FK path — resolveLevelUpContext's TARGET_ENTRY_SELECT carries subclassRef.features regardless of what level the persisted subclass happens to be at.
    const target: TargetClassEntry = {
      name: "fighter",
      newLevel: 3,
      subclass: "battle master",
      hitDie: ANY_DIE,
      classFeatureRows: FIGHTER_BASE_ROWS,
      subclassFeatureRows: BATTLE_MASTER_ROWS,
    };
    const steps = buildLevelUpPlan(char(2, edition, "battle master"), target);

    // #1516: canSwap rides the "maneuvers" step unconditionally whenever it exists (PHB'14 Battle Master p.73 / SRD 5.2 equivalent).
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
    // No subclassFeatureRows on target — the PICKED rows travel as resolveLevelUpPlan's own parameter (pickedSubclassFeatureRows), never baked onto target.
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
    // Canonical order (KIND_ORDER, level-up-submission.ts): subclass before maneuvers/toolProficiency, both before review.
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

// An absent carrier (no resolveLevelUpContext caller) must never throw, and a class/subclass with nothing row-driven still plans cleanly. derive-resources-null-flip.test.ts covers the null-flip consequence at the deriveResources layer directly.
describe("buildLevelUpPlan — an absent carrier never throws and grants nothing (no regression from #1546 Part B-i's threading)", () => {
  it("a target with no classFeatureRows/subclassFeatureRows at all still plans a non-Battle-Master level-up cleanly", () => {
    const target: TargetClassEntry = { name: "fighter", newLevel: 2, subclass: null, hitDie: ANY_DIE };
    expect(() => buildLevelUpPlan(char(1, "EDITION_2024"), target)).not.toThrow();
    const steps = buildLevelUpPlan(char(1, "EDITION_2024"), target);
    expect(stepsByKind(steps, "maneuvers")).toBeUndefined();
    expect(stepsByKind(steps, "toolProficiency")).toBeUndefined();
  });
});
