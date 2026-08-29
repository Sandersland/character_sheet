import { describe, it, expect } from "vitest";

import { level1SpellPicksFor } from "@/lib/srd/srd.js";
import { ELDRITCH_KNIGHT } from "./third-caster.fixture.js";

describe("level1SpellPicksFor — EDITION_2014", () => {
  it("known casters: fixed personal list from SRD 5.1", () => {
    expect(level1SpellPicksFor("Bard", null, "EDITION_2014")).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Sorcerer", null, "EDITION_2014")).toEqual({ cantrips: 4, spells: 2, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Warlock", null, "EDITION_2014")).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
  });

  it("Wizard: spellbook size (six scribed, distinct from the #1513 prepared count)", () => {
    expect(level1SpellPicksFor("Wizard", null, "EDITION_2014")).toEqual({
      cantrips: 3,
      spells: 6,
      maxSpellLevel: 1,
      spellbookSize: 6,
    });
  });

  it("Cleric/Druid: prepared-from-full-list — zero creation-time picks, cantrips only", () => {
    expect(level1SpellPicksFor("Cleric", null, "EDITION_2014")).toEqual({ cantrips: 3, spells: 0, maxSpellLevel: 0 });
    expect(level1SpellPicksFor("Druid", null, "EDITION_2014")).toEqual({ cantrips: 2, spells: 0, maxSpellLevel: 0 });
  });

  it("Paladin/Ranger: null — no Spellcasting feature until level 2 (SRD 5.1)", () => {
    expect(level1SpellPicksFor("Paladin", null, "EDITION_2014")).toBeNull();
    expect(level1SpellPicksFor("Ranger", null, "EDITION_2014")).toBeNull();
  });

  it("non-caster classes and a level-1 third-caster subclass are both null", () => {
    expect(level1SpellPicksFor("Fighter", null, "EDITION_2014")).toBeNull();
    expect(level1SpellPicksFor("Fighter", ELDRITCH_KNIGHT, "EDITION_2014")).toBeNull();
  });
});

// Wizard is the deliberate exception (#1513): spellbookSize is 6, not the prepared count of 4.
describe("level1SpellPicksFor — EDITION_2024 (byte-identical to pre-#1510 output, Wizard excepted)", () => {
  it("full and third-tier casters", () => {
    expect(level1SpellPicksFor("Bard", null, "EDITION_2024")).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Cleric", null, "EDITION_2024")).toEqual({ cantrips: 3, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Druid", null, "EDITION_2024")).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Sorcerer", null, "EDITION_2024")).toEqual({ cantrips: 4, spells: 2, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Warlock", null, "EDITION_2024")).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
  });

  it("half-casters: 0 cantrips, 2 spells (cast from level 1 in SRD 5.2)", () => {
    expect(level1SpellPicksFor("Paladin", null, "EDITION_2024")).toEqual({ cantrips: 0, spells: 2, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Ranger", null, "EDITION_2024")).toEqual({ cantrips: 0, spells: 2, maxSpellLevel: 1 });
  });

  it("non-casters are null", () => {
    expect(level1SpellPicksFor("Fighter", null, "EDITION_2024")).toBeNull();
  });

  it("Wizard: spellbook size (six scribed, distinct from the #1513 prepared count of four)", () => {
    expect(level1SpellPicksFor("Wizard", null, "EDITION_2024")).toEqual({
      cantrips: 3,
      spells: 6,
      maxSpellLevel: 1,
      spellbookSize: 6,
    });
  });
});

// SRD 5.1 / SRD 5.2: Wizard's spellbook (6) is separate from the prepared-spells count (4).
describe("level1SpellPicksFor — spellbookSize is Wizard-only, both editions (#1513)", () => {
  it("Wizard's spellbookSize (and spells) is 6 in EDITION_2014 and EDITION_2024", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const picks = level1SpellPicksFor("Wizard", null, edition);
      expect(picks?.spells).toBe(6);
      expect(picks?.spellbookSize).toBe(6);
    }
  });

  it("every non-Wizard caster omits spellbookSize in both editions", () => {
    expect(level1SpellPicksFor("Bard", null, "EDITION_2014")).not.toHaveProperty("spellbookSize");
    expect(level1SpellPicksFor("Sorcerer", null, "EDITION_2014")).not.toHaveProperty("spellbookSize");
    expect(level1SpellPicksFor("Cleric", null, "EDITION_2024")).not.toHaveProperty("spellbookSize");
    expect(level1SpellPicksFor("Paladin", null, "EDITION_2024")).not.toHaveProperty("spellbookSize");
  });
});
