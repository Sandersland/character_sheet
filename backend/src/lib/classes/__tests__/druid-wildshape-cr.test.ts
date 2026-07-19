// Circle of the Moon derives Circle Forms CR caps; base/Land keep the base table (#906).
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const ABILITIES = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 16,
  charisma: 10,
};

function wildShapeDescription(subclass: string | undefined, level: number): string | undefined {
  const info = deriveResources("druid", subclass, level, ABILITIES, proficiencyBonusForLevel(level));
  return info?.resources.find((r) => r.key === "wildShape")?.description;
}

describe("druid Wild Shape CR cap derivation (#906)", () => {
  it("Circle of the Moon caps CR at 1 from level 2", () => {
    expect(wildShapeDescription("circle of the moon", 2)).toContain("max CR 1 (no flying or swimming speed)");
    expect(wildShapeDescription("circle of the moon", 4)).toContain("max CR 1 (no flying speed)");
    expect(wildShapeDescription("circle of the moon", 5)).toContain("max CR 1 (no flying speed)");
  });

  it("Circle of the Moon uses level÷3 (min 1) from level 6", () => {
    expect(wildShapeDescription("circle of the moon", 6)).toContain("max CR 2 (no flying speed)");
    expect(wildShapeDescription("circle of the moon", 8)).toContain("max CR 2)");
    expect(wildShapeDescription("circle of the moon", 9)).toContain("max CR 3)");
    expect(wildShapeDescription("circle of the moon", 20)).toContain("max CR 6)");
  });

  it("base druid keeps the base CR table", () => {
    expect(wildShapeDescription(undefined, 2)).toContain("max CR 1/4 (no flying or swimming speed)");
    expect(wildShapeDescription(undefined, 4)).toContain("max CR 1/2 (no flying speed)");
    expect(wildShapeDescription(undefined, 6)).toContain("max CR 1/2 (no flying speed)");
    expect(wildShapeDescription(undefined, 8)).toContain("max CR 1)");
  });

  it("Circle of the Land keeps the base CR table", () => {
    expect(wildShapeDescription("circle of the land", 6)).toContain("max CR 1/2 (no flying speed)");
    expect(wildShapeDescription("circle of the land", 8)).toContain("max CR 1)");
  });

  it("no Wild Shape pool below level 2, even for the Moon", () => {
    expect(wildShapeDescription("circle of the moon", 1)).toBeUndefined();
    expect(wildShapeDescription(undefined, 1)).toBeUndefined();
  });
});
