// Pure (no DB) test for the "expertise" level-up plan step (#1588) — mirrors
// level-up-plan.test.ts's toolProficiency/maneuvers describe block. Rogue's
// base-class Expertise row is hand-crafted here the same way
// derive-entry-scoped-resources.test.ts builds it (Rogue carries no TS
// class module — its rows are literal seed data, prisma/tsconfig's rootDir
// boundary keeps this src-side test from importing them directly).
import { describe, it, expect } from "vitest";

import { buildLevelUpPlan, type LevelUpPlanCharacter, type TargetClassEntry } from "@/lib/leveling/level-up-plan.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

const ABILITIES = { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10 };
const ANY_DIE = "d8";

// Mirrors the real seeded Rogue Expertise row (rogue-features.ts, both editions).
function rogueExpertiseRow(edition: "EDITION_2014" | "EDITION_2024"): ClassFeatureRow {
  return {
    name: "Expertise",
    level: 1,
    description: "Choose two of your skill proficiencies. Your proficiency bonus is doubled for those skills.",
    edition,
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 1, value: 2 },
      { minLevel: 6, value: 4 },
    ],
  };
}

function char(level: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014"): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name: "rogue", level, subclass: null }], edition };
}

function rogueTarget(newLevel: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014"): TargetClassEntry {
  return {
    name: "rogue",
    newLevel,
    subclass: null,
    hitDie: ANY_DIE,
    classFeatureRows: [rogueExpertiseRow(edition)],
  };
}

function kinds(steps: ReturnType<typeof buildLevelUpPlan>): string[] {
  return steps.map((s) => s.kind);
}

describe("buildLevelUpPlan — expertise (#1588)", () => {
  it("Rogue 0→1 emits an expertise step with count 2", () => {
    const plan = buildLevelUpPlan(char(0), rogueTarget(1));
    expect(kinds(plan)).toContain("expertise");
    expect(plan.find((s) => s.kind === "expertise")?.count).toBe(2);
  });

  it("Rogue 5→6 emits an expertise step with count 2 (4 - 2 delta)", () => {
    const plan = buildLevelUpPlan(char(5), rogueTarget(6));
    expect(plan.find((s) => s.kind === "expertise")?.count).toBe(2);
  });

  it("Rogue 4→5 emits no expertise step (no delta between L1's tier and L5)", () => {
    const plan = buildLevelUpPlan(char(4), rogueTarget(5));
    expect(kinds(plan)).not.toContain("expertise");
  });
});
