import { describe, it, expect } from "vitest";

// 2024 rules (SRD 5.2): the 2014 "spells known" tables are gone — every caster
// prepares. The level-up new-spell pick count is now the prepared-count delta for
// onLevelUp-cadence classes, a flat 2 for the Wizard's spellbook, and 0 for the
// re-prepare classes (Cleric/Druid/Paladin/Ranger). Filename kept per #1127 AC.
import {
  levelUpSpellPicks,
  levelUpCantripPicks,
  cantripsKnownAtLevel,
  preparedSpellCountAt,
  maxSpellLevelForClass,
} from "@/lib/srd/spellcasting-tables.js";

describe("levelUpSpellPicks — 2024 new-spell pick count on level-up", () => {
  it("Wizard scribes 4 at level 1 (its prepared count), then a flat 2 per level (#1131)", () => {
    expect(levelUpSpellPicks("wizard", 1)).toBe(4);
    expect(levelUpSpellPicks("wizard", 2)).toBe(2);
    expect(levelUpSpellPicks("Wizard", 8)).toBe(2);
    expect(levelUpSpellPicks("wizard", 20)).toBe(2);
  });

  it("level-1 picks equal the class's prepared count for every caster; 0 for non-casters (#1131)", () => {
    for (const cls of ["wizard", "cleric", "druid", "bard", "sorcerer", "warlock", "paladin", "ranger"]) {
      expect(levelUpSpellPicks(cls, 1)).toBe(preparedSpellCountAt(cls, 1));
    }
    expect(levelUpSpellPicks("wizard", 1)).toBe(4);
    expect(levelUpSpellPicks("cleric", 1)).toBe(4);
    expect(levelUpSpellPicks("paladin", 1)).toBe(2);
    expect(levelUpSpellPicks("fighter", 1)).toBe(0);
    expect(levelUpSpellPicks("monk", 1)).toBe(0);
  });

  it("Sorcerer offers the prepared-count delta on each onLevelUp level", () => {
    expect(levelUpSpellPicks("sorcerer", 1)).toBe(2); // prepares 2 at level 1
    expect(levelUpSpellPicks("sorcerer", 2)).toBe(2); // 2 → 4
    expect(levelUpSpellPicks("sorcerer", 4)).toBe(1); // 6 → 7
    expect(levelUpSpellPicks("sorcerer", 11)).toBe(1); // 15 → 16
    expect(levelUpSpellPicks("sorcerer", 12)).toBe(0); // 16 → 16 (swap-only)
  });

  it("Bard offers a delta pick each level (Magical Secrets is a separate flag)", () => {
    expect(levelUpSpellPicks("bard", 2)).toBe(1);
    expect(levelUpSpellPicks("bard", 10)).toBe(1);
    expect(levelUpSpellPicks("bard", 12)).toBe(0);
  });

  it("Warlock offers +1 on growth levels and 0 on flat levels", () => {
    expect(levelUpSpellPicks("warlock", 2)).toBe(1);
    expect(levelUpSpellPicks("warlock", 10)).toBe(0);
    expect(levelUpSpellPicks("warlock", 11)).toBe(1);
  });

  it("re-prepare classes offer only the level-1 initial picks, then 0 (Cleric/Druid/Paladin/Ranger) (#1131)", () => {
    for (const cls of ["cleric", "druid", "paladin", "ranger"]) {
      expect(levelUpSpellPicks(cls, 1)).toBe(preparedSpellCountAt(cls, 1));
      for (let lvl = 2; lvl <= 20; lvl++) expect(levelUpSpellPicks(cls, lvl)).toBe(0);
    }
  });

  it("non-casters never offer a pick", () => {
    for (const cls of ["fighter", "barbarian", "monk"]) {
      for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpSpellPicks(cls, lvl)).toBe(0);
    }
  });

  it("Eldritch Knight / Arcane Trickster offer the third-caster delta from level 3", () => {
    expect(levelUpSpellPicks("fighter", 3, "Eldritch Knight")).toBe(3); // first prepared: 0 → 3
    expect(levelUpSpellPicks("fighter", 4, "Eldritch Knight")).toBe(1); // 3 → 4
    expect(levelUpSpellPicks("rogue", 12, "Arcane Trickster")).toBe(0); // 8 → 8
  });
});

describe("levelUpCantripPicks — 2024 cantrip pick count on level-up (#1131)", () => {
  it("offers the cantrips-known delta on a growth level", () => {
    expect(levelUpCantripPicks("warlock", 4)).toBe(1); // 2 → 3
    expect(levelUpCantripPicks("cleric", 4)).toBe(1); // 3 → 4
    expect(levelUpCantripPicks("wizard", 10)).toBe(1); // 4 → 5
  });

  it("level-1 picks equal the full cantrips-known count for every caster", () => {
    for (const cls of ["wizard", "cleric", "druid", "bard", "sorcerer", "warlock"]) {
      expect(levelUpCantripPicks(cls, 1)).toBe(cantripsKnownAtLevel(cls, 1));
    }
  });

  it("is 0 on a flat cantrip level and for Paladin/Ranger (no cantrips)", () => {
    expect(levelUpCantripPicks("warlock", 5)).toBe(0); // 3 → 3
    for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpCantripPicks("paladin", lvl)).toBe(0);
    for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpCantripPicks("ranger", lvl)).toBe(0);
  });

  it("third casters (EK/AT) gain 2 at level 3 and 1 more at level 10", () => {
    expect(levelUpCantripPicks("fighter", 3, "Eldritch Knight")).toBe(2); // 0 → 2
    expect(levelUpCantripPicks("rogue", 10, "Arcane Trickster")).toBe(1); // 2 → 3
  });

  it("is 0 for a non-caster at every level", () => {
    for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpCantripPicks("fighter", lvl)).toBe(0);
  });
});

describe("maxSpellLevelForClass", () => {
  it("derives the highest slot level a full caster has (ceiling climbs every other level)", () => {
    expect(maxSpellLevelForClass("wizard", 1)).toBe(1);
    expect(maxSpellLevelForClass("wizard", 3)).toBe(2);
    expect(maxSpellLevelForClass("wizard", 8)).toBe(4);
    expect(maxSpellLevelForClass("wizard", 9)).toBe(5);
    expect(maxSpellLevelForClass("Bard", 10)).toBe(5);
  });

  it("half-casters cast from level 1 (SRD 5.2), then climb the half-caster ceiling", () => {
    expect(maxSpellLevelForClass("ranger", 1)).toBe(1);
    expect(maxSpellLevelForClass("ranger", 2)).toBe(1);
    expect(maxSpellLevelForClass("ranger", 5)).toBe(2);
  });

  it("reads Pact Magic's single slot level for a Warlock", () => {
    expect(maxSpellLevelForClass("warlock", 1)).toBe(1);
    expect(maxSpellLevelForClass("warlock", 3)).toBe(2);
    expect(maxSpellLevelForClass("warlock", 9)).toBe(5);
  });

  it("is 0 for a non-caster (no derived slots)", () => {
    expect(maxSpellLevelForClass("fighter", 5)).toBe(0);
    expect(maxSpellLevelForClass("barbarian", 20)).toBe(0);
  });
});
