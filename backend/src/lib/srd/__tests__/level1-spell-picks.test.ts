import { describe, it, expect } from "vitest";

import { level1SpellPicksFor } from "@/lib/srd/srd.js";

// #1510: level1SpellPicksFor owns the whole level-1 creation-picks object for
// BOTH the reference route and the creation gate (D4) — pin the full table for
// each edition here as the pure, no-Postgres source of truth.
describe("level1SpellPicksFor — EDITION_2014", () => {
  it("known casters: fixed personal list from SRD 5.1", () => {
    expect(level1SpellPicksFor("Bard", null, "EDITION_2014")).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Sorcerer", null, "EDITION_2014")).toEqual({ cantrips: 4, spells: 2, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Warlock", null, "EDITION_2014")).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
  });

  it("Wizard: spellbook size (six scribed, distinct from the #1513 prepared count)", () => {
    expect(level1SpellPicksFor("Wizard", null, "EDITION_2014")).toEqual({ cantrips: 3, spells: 6, maxSpellLevel: 1 });
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
    expect(level1SpellPicksFor("Fighter", "Eldritch Knight", "EDITION_2014")).toBeNull();
  });
});

// The 2024 branch must reproduce today's values byte-identically — this pin,
// plus reference.test.ts's untouched 2024 route test, is the no-regression gate.
describe("level1SpellPicksFor — EDITION_2024 (byte-identical to pre-#1510 output)", () => {
  it("full and third-tier casters", () => {
    expect(level1SpellPicksFor("Bard", null, "EDITION_2024")).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Cleric", null, "EDITION_2024")).toEqual({ cantrips: 3, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Druid", null, "EDITION_2024")).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Sorcerer", null, "EDITION_2024")).toEqual({ cantrips: 4, spells: 2, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Wizard", null, "EDITION_2024")).toEqual({ cantrips: 3, spells: 4, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Warlock", null, "EDITION_2024")).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
  });

  it("half-casters: 0 cantrips, 2 spells (cast from level 1 in SRD 5.2)", () => {
    expect(level1SpellPicksFor("Paladin", null, "EDITION_2024")).toEqual({ cantrips: 0, spells: 2, maxSpellLevel: 1 });
    expect(level1SpellPicksFor("Ranger", null, "EDITION_2024")).toEqual({ cantrips: 0, spells: 2, maxSpellLevel: 1 });
  });

  it("non-casters are null", () => {
    expect(level1SpellPicksFor("Fighter", null, "EDITION_2024")).toBeNull();
  });
});
