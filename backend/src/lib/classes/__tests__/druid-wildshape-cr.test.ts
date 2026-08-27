// Circle of the Moon derives Circle Forms CR caps; base/Land keep the base
// table (#906) — EDITION_2014 only. #1226 commit 3: the EDITION_2024 pool
// moved wholesale onto druid-features.ts's Wild Shape row (wildShapeCrCap and
// wildShapeSpeedNote are now 2014-only, gated by `edition === "EDITION_2024"
// -> []` at the top of lib/classes/druid.ts's resourceFn) — SRD 5.2 states a
// flat, subclass-invariant CR table in prose instead of a computed value, so
// under 2024 every subclass context reads the SAME Wild Shape description;
// Circle of the Moon's own level/3 CR bump is a FEATURE-list fact (its Circle
// Forms row) now, never baked into the pool description. This file used to
// assert 2014's computed values under a hardcoded "EDITION_2024" call — that
// was the stale-copy bug #1226 exists to fix.
//
// The pool-detail-fields task moved the computed CR cap off the description
// string onto the pool's own `details` (armorClassBreakdown pattern) — this
// file now reads the "Max CR" detail part instead of matching description
// substrings.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITIES = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 16,
  charisma: 10,
};

function wildShapePool(subclass: string | undefined, level: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014") {
  const info = deriveResources("druid", subclass, level, ABILITIES, proficiencyBonusForLevel(level), testFeatureRowsFor("druid", subclass), edition);
  return info?.resources.find((r) => r.key === "wildShape");
}

function wildShapeDescription(subclass: string | undefined, level: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014"): string | undefined {
  return wildShapePool(subclass, level, edition)?.description;
}

function wildShapeMaxCr(subclass: string | undefined, level: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014"): string | undefined {
  return wildShapePool(subclass, level, edition)?.details?.find((d) => d.label === "Max CR")?.value;
}

describe("druid Wild Shape CR cap derivation, EDITION_2014 (#906) — 2014-only, unaffected by #1226", () => {
  // PHB'14 p.66: Circle of the Moon grants at level 2 (druid.ts's own
  // `grantLevel: 2`) — subclassGateLevel resolves the 2014 gate straight off
  // that value when no CharacterClass.subclassLevel relation is supplied
  // (testFeatureRowsFor carries none), unlike EDITION_2024's hardcoded gate
  // of 3 regardless of `grantLevel` (effective-levels.ts). Circle Forms
  // itself caps CR at 1 from L2-L5 (its "starting at level 6" step hasn't
  // hit yet), so this is a flat "1", not the base table's "1/4" — the prior
  // version of this test called deriveResources with a hardcoded
  // "EDITION_2024" (which always gates at 3, masking this) while asserting
  // this exact SRD 5.1 text; that's the bug #1226 was retargeting to fix.
  it("Circle of the Moon caps CR at 1 starting at its own level-2 grant", () => {
    expect(wildShapeMaxCr("circle of the moon", 2)).toBe("1 (no flying or swimming speed)");
    expect(wildShapeMaxCr("circle of the moon", 3)).toBe("1 (no flying or swimming speed)");
    expect(wildShapeMaxCr("circle of the moon", 4)).toBe("1 (no flying speed)");
    expect(wildShapeMaxCr("circle of the moon", 5)).toBe("1 (no flying speed)");
  });

  it("Circle of the Moon uses level÷3 (min 1) from level 6", () => {
    expect(wildShapeMaxCr("circle of the moon", 6)).toBe("2 (no flying speed)");
    expect(wildShapeMaxCr("circle of the moon", 8)).toBe("2");
    expect(wildShapeMaxCr("circle of the moon", 9)).toBe("3");
    expect(wildShapeMaxCr("circle of the moon", 20)).toBe("6");
  });

  it("base druid keeps the base CR table", () => {
    expect(wildShapeMaxCr(undefined, 2)).toBe("1/4 (no flying or swimming speed)");
    expect(wildShapeMaxCr(undefined, 4)).toBe("1/2 (no flying speed)");
    expect(wildShapeMaxCr(undefined, 6)).toBe("1/2 (no flying speed)");
    expect(wildShapeMaxCr(undefined, 8)).toBe("1");
  });

  it("Circle of the Land keeps the base CR table", () => {
    expect(wildShapeMaxCr("circle of the land", 6)).toBe("1/2 (no flying speed)");
    expect(wildShapeMaxCr("circle of the land", 8)).toBe("1");
  });

  it("no Wild Shape pool below level 2, even for the Moon", () => {
    expect(wildShapeMaxCr("circle of the moon", 1)).toBeUndefined();
    expect(wildShapeMaxCr(undefined, 1)).toBeUndefined();
  });
});

describe("druid Wild Shape pool, EDITION_2024 (#1226): flat, subclass-invariant description — no computed CR cap", () => {
  it("the SAME description is served regardless of subclass — the CR cap is no longer subclass-derived", () => {
    const base = wildShapeDescription(undefined, 10, "EDITION_2024");
    const land = wildShapeDescription("circle of the land", 10, "EDITION_2024");
    const moon = wildShapeDescription("circle of the moon", 10, "EDITION_2024");
    expect(base).toBeDefined();
    expect(land).toBe(base);
    expect(moon).toBe(base);
  });

  it("states the static three-tier CR table and the Fly-only speed gate in prose", () => {
    const description = wildShapeDescription(undefined, 10, "EDITION_2024");
    expect(description).toContain("1/4 or lower at level 2");
    expect(description).toContain("1/2 or lower at level 4");
    expect(description).toContain("1 or lower starting at level 8");
    expect(description).toContain("Fly Speed");
    expect(description).not.toContain("max CR");
  });

  it("no Wild Shape pool below level 2, even for the Moon", () => {
    expect(wildShapeDescription("circle of the moon", 1, "EDITION_2024")).toBeUndefined();
    expect(wildShapeDescription(undefined, 1, "EDITION_2024")).toBeUndefined();
  });
});
