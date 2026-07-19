import { describe, it, expect } from "vitest";

import {
  PREPARED_SPELLS_BY_CLASS,
  preparedSpellCountAt,
  cantripsKnownAtLevel,
  swapCadenceFor,
  deriveSpellcasting,
} from "@/lib/srd/srd.js";

// SRD 5.2 prepared-spell counts (2024). Spot checks at L1/5/12/17/20 per class,
// plus the third-caster (EK/AT) column keyed by subclass from class level 3.
describe("preparedSpellCountAt — per-class SRD 5.2 tables", () => {
  it("full casters that share the Bard/Cleric/Druid column", () => {
    for (const cls of ["bard", "cleric", "druid"]) {
      expect(preparedSpellCountAt(cls, 1)).toBe(4);
      expect(preparedSpellCountAt(cls, 5)).toBe(9);
      expect(preparedSpellCountAt(cls, 12)).toBe(16);
      expect(preparedSpellCountAt(cls, 17)).toBe(19);
      expect(preparedSpellCountAt(cls, 20)).toBe(22);
    }
  });

  it("Sorcerer (starts lower at L1/L2, else the full-caster column)", () => {
    expect(preparedSpellCountAt("sorcerer", 1)).toBe(2);
    expect(preparedSpellCountAt("sorcerer", 5)).toBe(9);
    expect(preparedSpellCountAt("sorcerer", 12)).toBe(16);
    expect(preparedSpellCountAt("sorcerer", 17)).toBe(19);
    expect(preparedSpellCountAt("sorcerer", 20)).toBe(22);
  });

  it("Wizard (highest ceiling)", () => {
    expect(preparedSpellCountAt("wizard", 1)).toBe(4);
    expect(preparedSpellCountAt("wizard", 5)).toBe(9);
    expect(preparedSpellCountAt("wizard", 12)).toBe(16);
    expect(preparedSpellCountAt("wizard", 17)).toBe(22);
    expect(preparedSpellCountAt("wizard", 20)).toBe(25);
  });

  it("Warlock", () => {
    expect(preparedSpellCountAt("warlock", 1)).toBe(2);
    expect(preparedSpellCountAt("warlock", 5)).toBe(6);
    expect(preparedSpellCountAt("warlock", 12)).toBe(11);
    expect(preparedSpellCountAt("warlock", 17)).toBe(14);
    expect(preparedSpellCountAt("warlock", 20)).toBe(15);
  });

  it("Paladin and Ranger share the half-caster column (from level 1)", () => {
    for (const cls of ["paladin", "ranger"]) {
      expect(preparedSpellCountAt(cls, 1)).toBe(2);
      expect(preparedSpellCountAt(cls, 5)).toBe(6);
      expect(preparedSpellCountAt(cls, 12)).toBe(10);
      expect(preparedSpellCountAt(cls, 17)).toBe(14);
      expect(preparedSpellCountAt(cls, 20)).toBe(15);
    }
  });

  it("Eldritch Knight / Arcane Trickster (third caster, keyed by subclass from L3)", () => {
    for (const sub of ["Eldritch Knight", "Arcane Trickster"]) {
      expect(preparedSpellCountAt("fighter", 2, sub)).toBeNull(); // subclass not active yet
      expect(preparedSpellCountAt("fighter", 3, sub)).toBe(3);
      expect(preparedSpellCountAt("fighter", 5, sub)).toBe(4);
      expect(preparedSpellCountAt("fighter", 12, sub)).toBe(8);
      expect(preparedSpellCountAt("fighter", 17, sub)).toBe(11);
      expect(preparedSpellCountAt("fighter", 20, sub)).toBe(13);
    }
  });

  it("returns null for a non-caster", () => {
    expect(preparedSpellCountAt("fighter", 5)).toBeNull();
    expect(preparedSpellCountAt("barbarian", 20)).toBeNull();
  });

  it("every prepared-caster column is monotonically non-decreasing over levels 1-20", () => {
    for (const table of Object.values(PREPARED_SPELLS_BY_CLASS)) {
      for (let i = 1; i < 20; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1]);
    }
  });

  it("third-caster column is monotonically non-decreasing over levels 3-20", () => {
    for (let level = 4; level <= 20; level++) {
      expect(preparedSpellCountAt("fighter", level, "Eldritch Knight")).toBeGreaterThanOrEqual(
        preparedSpellCountAt("fighter", level - 1, "Eldritch Knight") ?? 0,
      );
    }
  });
});

describe("cantripsKnownAtLevel — SRD 5.2 cantrip columns (data only, #1131 wires the step)", () => {
  const cases: Array<[string, number, number, number]> = [
    // [class, atL1, atL4, atL10]
    ["bard", 2, 3, 4],
    ["cleric", 3, 4, 5],
    ["druid", 2, 3, 4],
    ["sorcerer", 4, 5, 6],
    ["wizard", 3, 4, 5],
    ["warlock", 2, 3, 4],
  ];
  it.each(cases)("%s cantrips: %i @1, %i @4, %i @10", (cls, a1, a4, a10) => {
    expect(cantripsKnownAtLevel(cls, 1)).toBe(a1);
    expect(cantripsKnownAtLevel(cls, 4)).toBe(a4);
    expect(cantripsKnownAtLevel(cls, 10)).toBe(a10);
  });

  it("Paladin/Ranger prepare no cantrips", () => {
    expect(cantripsKnownAtLevel("paladin", 20)).toBe(0);
    expect(cantripsKnownAtLevel("ranger", 20)).toBe(0);
  });

  it("Eldritch Knight / Arcane Trickster: 2 from L3, 3 from L10", () => {
    expect(cantripsKnownAtLevel("fighter", 2, "Eldritch Knight")).toBe(0);
    expect(cantripsKnownAtLevel("fighter", 3, "Eldritch Knight")).toBe(2);
    expect(cantripsKnownAtLevel("rogue", 10, "Arcane Trickster")).toBe(3);
  });
});

describe("swapCadenceFor — SRD 5.2 spell-swap cadence", () => {
  it("onLevelUp for Bard/Sorcerer/Warlock + EK/AT", () => {
    for (const cls of ["bard", "sorcerer", "warlock"]) expect(swapCadenceFor(cls)).toBe("onLevelUp");
    expect(swapCadenceFor("fighter", "Eldritch Knight")).toBe("onLevelUp");
    expect(swapCadenceFor("rogue", "Arcane Trickster")).toBe("onLevelUp");
  });

  it("oneOnLongRest for Paladin/Ranger", () => {
    expect(swapCadenceFor("paladin")).toBe("oneOnLongRest");
    expect(swapCadenceFor("ranger")).toBe("oneOnLongRest");
  });

  it("anyOnLongRest for Cleric/Druid/Wizard", () => {
    for (const cls of ["cleric", "druid", "wizard"]) expect(swapCadenceFor(cls)).toBe("anyOnLongRest");
  });

  it("null for a non-caster", () => {
    expect(swapCadenceFor("fighter")).toBeNull();
  });
});

describe("2024 half-casters cast from level 1", () => {
  it("Paladin level 1 has two 1st-level slots", () => {
    const derived = deriveSpellcasting("paladin", 1, { charisma: 16 }, 2);
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 2 }]);
  });

  it("Ranger level 1 has two 1st-level slots", () => {
    const derived = deriveSpellcasting("ranger", 1, { wisdom: 16 }, 2);
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 2 }]);
  });
});
