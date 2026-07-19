import { describe, it, expect } from "vitest";

// 2024 rules (SRD 5.2): the 2014 "spells known" tables are gone — every caster
// prepares. The level-up new-spell pick count is now the prepared-count delta for
// onLevelUp-cadence classes, a flat 2 for the Wizard's spellbook, and 0 for the
// re-prepare classes (Cleric/Druid/Paladin/Ranger). Filename kept per #1127 AC.
import {
  levelUpSpellPicks,
  maxSpellLevelForClass,
} from "@/lib/srd/spellcasting-tables.js";

describe("levelUpSpellPicks — 2024 new-spell pick count on level-up", () => {
  it("Wizard scribes a flat 2 per level from level 2 up, 0 at level 1", () => {
    expect(levelUpSpellPicks("wizard", 1)).toBe(0);
    expect(levelUpSpellPicks("wizard", 2)).toBe(2);
    expect(levelUpSpellPicks("Wizard", 8)).toBe(2);
    expect(levelUpSpellPicks("wizard", 20)).toBe(2);
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

  it("re-prepare classes never offer a level-up pick (Cleric/Druid/Paladin/Ranger)", () => {
    for (const cls of ["cleric", "druid", "paladin", "ranger"]) {
      for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpSpellPicks(cls, lvl)).toBe(0);
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
