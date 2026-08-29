// The computed CR cap is EDITION_2014-only: SRD 5.2 states a flat,
// subclass-invariant CR table in prose, so under 2024 every subclass reads the
// same Wild Shape description and Circle of the Moon's level/3 bump lives on
// its Circle Forms feature row instead (#1226).
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
  // PHB'14 p.66: Circle of the Moon grants at level 2 — testFeatureRowsFor
  // supplies the seeded subclassLevel (2, SUBCLASS_LEVEL_BY_CLASS), unlike
  // EDITION_2024's hardcoded gate of 3. Circle Forms caps CR at a flat 1 from
  // L2-L5 (its "starting at level 6" step hasn't hit yet), not the base
  // table's "1/4".
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
    expect(wildShapePool("circle of the moon", 1)).toBeUndefined();
    expect(wildShapePool(undefined, 1)).toBeUndefined();
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
