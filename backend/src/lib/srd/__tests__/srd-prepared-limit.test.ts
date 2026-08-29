import { describe, it, expect } from "vitest";

import { derivePreparedSpellLimit, type SubclassCasterRef } from "@/lib/srd/srd.js";
import { ELDRITCH_KNIGHT, ARCANE_TRICKSTER } from "./third-caster.fixture.js";

const single = (name: string, level: number, subclassRef?: SubclassCasterRef | null) =>
  derivePreparedSpellLimit([{ name, level, subclassRef }], {}, "EDITION_2024");

// SRD 5.2 (2024): prepared count is a per-class table column, not ability mod + level.
describe("derivePreparedSpellLimit (2024 table sum)", () => {
  it("Cleric 8 → 12 regardless of WIS", () => {
    expect(single("cleric", 8)).toBe(12);
    expect(derivePreparedSpellLimit([{ name: "cleric", level: 8, subclassRef: null }], {}, "EDITION_2024")).toBe(12);
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

  it("third casters prepare from level 3 (Eldritch Knight 8 → 6), resolved off subclassRef", () => {
    expect(single("fighter", 8, ELDRITCH_KNIGHT)).toBe(6);
    expect(single("rogue", 8, ARCANE_TRICKSTER)).toBe(6);
    expect(single("fighter", 2, ELDRITCH_KNIGHT)).toBeNull();
  });

  it("multiclass sums each caster class's own table value", () => {
    expect(
      derivePreparedSpellLimit([
        { name: "wizard", level: 5, subclassRef: null },
        { name: "paladin", level: 1, subclassRef: null },
      ], {}, "EDITION_2024"),
    ).toBe(11);
    expect(
      derivePreparedSpellLimit([
        { name: "wizard", level: 8, subclassRef: null },
        { name: "cleric", level: 4, subclassRef: null },
      ], {}, "EDITION_2024"),
    ).toBe(19);
  });

  it("non-casters → null (no caster entry at all)", () => {
    expect(single("fighter", 8)).toBeNull();
    expect(single("barbarian", 20)).toBeNull();
    expect(
      derivePreparedSpellLimit([
        { name: "fighter", level: 5, subclassRef: null },
        { name: "barbarian", level: 3, subclassRef: null },
      ], {}, "EDITION_2024"),
    ).toBeNull();
  });
});

// #1507: the reconciler/clamp-on-read latch — one function serves both editions.
describe("derivePreparedSpellLimit (2014 known/formula sum)", () => {
  it("2014 Bard 3 / Cleric 2 sums a known-caster count and a formula count", () => {
    expect(
      derivePreparedSpellLimit(
        [
          { name: "bard", level: 3, subclassRef: null },
          { name: "cleric", level: 2, subclassRef: null },
        ],
        { wisdom: 14 },
        "EDITION_2014",
      ),
    ).toBe(10);
  });

  it("2014 Paladin 1 has no spellcasting at all yet (level-1 gate)", () => {
    expect(derivePreparedSpellLimit([{ name: "paladin", level: 1, subclassRef: null }], { charisma: 14 }, "EDITION_2014")).toBeNull();
  });
});
