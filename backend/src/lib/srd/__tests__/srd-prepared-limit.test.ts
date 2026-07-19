import { describe, it, expect } from "vitest";

import { derivePreparedSpellLimit } from "@/lib/srd/srd.js";

const single = (name: string, level: number, subclass?: string) =>
  derivePreparedSpellLimit([{ name, level, subclass }]);

// SRD 5.2 (2024): the prepared count is a per-class table column, no longer
// ability mod + level — so it no longer depends on ability scores.
describe("derivePreparedSpellLimit (2024 table sum)", () => {
  it("Cleric 8 → 12 regardless of WIS", () => {
    expect(single("cleric", 8)).toBe(12);
    expect(derivePreparedSpellLimit([{ name: "cleric", level: 8, subclass: null }])).toBe(12);
    expect(single("druid", 8)).toBe(12);
  });

  it("Wizard 20 → 25 (highest full-caster prepared count)", () => {
    expect(single("wizard", 20)).toBe(25);
  });

  it("Warlock 5 → 6 (now a prepared caster, non-null)", () => {
    expect(single("warlock", 5)).toBe(6);
  });

  it("Sorcerer 5 → 9 (non-null, its own column)", () => {
    expect(single("sorcerer", 5)).toBe(9);
  });

  it("Paladin 1 → 2 (half-casters prepare from level 1)", () => {
    expect(single("paladin", 1)).toBe(2);
    expect(single("ranger", 1)).toBe(2);
  });

  it("third casters prepare from level 3 (Eldritch Knight 8 → 6)", () => {
    expect(single("fighter", 8, "Eldritch Knight")).toBe(6);
    expect(single("rogue", 8, "Arcane Trickster")).toBe(6);
    expect(single("fighter", 2, "Eldritch Knight")).toBeNull(); // subclass not yet active
  });

  it("multiclass sums each caster class's own table value", () => {
    expect(
      derivePreparedSpellLimit([
        { name: "wizard", level: 5, subclass: null },
        { name: "paladin", level: 1, subclass: null },
      ]),
    ).toBe(11); // wizard 9 + paladin 2
    expect(
      derivePreparedSpellLimit([
        { name: "wizard", level: 8, subclass: null },
        { name: "cleric", level: 4, subclass: null },
      ]),
    ).toBe(19); // wizard 12 + cleric 7
  });

  it("non-casters → null (no caster entry at all)", () => {
    expect(single("fighter", 8)).toBeNull();
    expect(single("barbarian", 20)).toBeNull();
    expect(
      derivePreparedSpellLimit([
        { name: "fighter", level: 5, subclass: null },
        { name: "barbarian", level: 3, subclass: null },
      ]),
    ).toBeNull();
  });
});
