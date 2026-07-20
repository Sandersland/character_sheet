import { describe, it, expect } from "vitest";

import { SPELL_SCHOOLS } from "@/lib/addSpell";
import { damagePillClass, schoolInk, schoolRibbon } from "@/lib/spellFlavor";

describe("schoolInk / schoolRibbon", () => {
  it("maps every school to an ink class and a ribbon class", () => {
    for (const school of SPELL_SCHOOLS) {
      expect(schoolInk(school)).toContain(`text-school-${school}`);
      const ribbon = schoolRibbon(school);
      expect(ribbon).toContain(`bg-school-${school}`);
      expect(ribbon).toContain(`text-school-${school}`);
    }
  });
});

describe("damagePillClass", () => {
  it("tints known damage types (fire, cold)", () => {
    expect(damagePillClass("fire")).toContain("dmg-fire");
    expect(damagePillClass("cold")).toContain("dmg-cold");
  });

  it("falls back to one neutral pill for unknown or absent damage", () => {
    const neutral = damagePillClass("chaos");
    expect(neutral).not.toContain("dmg-");
    expect(neutral).toContain("parchment");
    expect(damagePillClass(null)).toBe(neutral);
    expect(damagePillClass(undefined)).toBe(neutral);
  });
});
