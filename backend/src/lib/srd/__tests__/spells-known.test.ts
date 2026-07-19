import { describe, it, expect } from "vitest";

import {
  BARD_MAGICAL_SECRETS_LEVELS,
  SPELLS_KNOWN_BY_CLASS,
  maxSpellLevelForClass,
  spellsGainedAtLevel,
  learnsNewSpellsOnLevelUp,
} from "@/lib/srd/spellcasting-tables.js";

describe("SPELLS_KNOWN_BY_CLASS tables", () => {
  it("covers every level 1-20 for each known caster", () => {
    for (const table of Object.values(SPELLS_KNOWN_BY_CLASS)) {
      for (let lvl = 1; lvl <= 20; lvl++) expect(table[lvl]).toBeTypeOf("number");
    }
  });

  it("is monotonically non-decreasing", () => {
    for (const table of Object.values(SPELLS_KNOWN_BY_CLASS)) {
      for (let lvl = 2; lvl <= 20; lvl++) expect(table[lvl]).toBeGreaterThanOrEqual(table[lvl - 1]);
    }
  });

  it("omits prepared casters and Wizard (they don't learn from a Known column)", () => {
    expect(SPELLS_KNOWN_BY_CLASS.cleric).toBeUndefined();
    expect(SPELLS_KNOWN_BY_CLASS.druid).toBeUndefined();
    expect(SPELLS_KNOWN_BY_CLASS.paladin).toBeUndefined();
    expect(SPELLS_KNOWN_BY_CLASS.wizard).toBeUndefined();
  });
});

describe("spellsGainedAtLevel", () => {
  it("Wizard adds a flat 2 per level from level 2 up, 0 at level 1", () => {
    expect(spellsGainedAtLevel("wizard", 1)).toBe(0);
    expect(spellsGainedAtLevel("wizard", 2)).toBe(2);
    expect(spellsGainedAtLevel("Wizard", 8)).toBe(2);
    expect(spellsGainedAtLevel("wizard", 20)).toBe(2);
  });

  it("Sorcerer gains +1 on growth levels and 0 on flat levels", () => {
    expect(spellsGainedAtLevel("sorcerer", 1)).toBe(2);
    expect(spellsGainedAtLevel("sorcerer", 2)).toBe(1);
    expect(spellsGainedAtLevel("sorcerer", 11)).toBe(1);
    expect(spellsGainedAtLevel("sorcerer", 12)).toBe(0);
  });

  it("Bard adds the Magical Secrets +2 jumps at 10/14/18", () => {
    expect(spellsGainedAtLevel("bard", 2)).toBe(1);
    expect(spellsGainedAtLevel("bard", 10)).toBe(2);
    expect(spellsGainedAtLevel("bard", 14)).toBe(2);
    expect(spellsGainedAtLevel("bard", 18)).toBe(2);
    expect(spellsGainedAtLevel("bard", 12)).toBe(0);
    expect([...BARD_MAGICAL_SECRETS_LEVELS].sort((a, b) => a - b)).toEqual([10, 14, 18]);
  });

  it("Ranger learns nothing at level 1, then follows the half-caster cadence", () => {
    expect(spellsGainedAtLevel("ranger", 1)).toBe(0);
    expect(spellsGainedAtLevel("ranger", 2)).toBe(2);
    expect(spellsGainedAtLevel("ranger", 3)).toBe(1);
    expect(spellsGainedAtLevel("ranger", 4)).toBe(0);
  });

  it("Warlock gains +1 on growth levels and 0 on flat levels", () => {
    expect(spellsGainedAtLevel("warlock", 2)).toBe(1);
    expect(spellsGainedAtLevel("warlock", 10)).toBe(0);
    expect(spellsGainedAtLevel("warlock", 11)).toBe(1);
  });

  it("prepared casters and non-casters never learn on level-up", () => {
    for (const cls of ["cleric", "druid", "paladin", "fighter", "barbarian"]) {
      for (let lvl = 1; lvl <= 20; lvl++) expect(spellsGainedAtLevel(cls, lvl)).toBe(0);
    }
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

describe("learnsNewSpellsOnLevelUp", () => {
  it("is true for known casters and Wizard", () => {
    for (const cls of ["wizard", "sorcerer", "bard", "ranger", "warlock"]) {
      expect(learnsNewSpellsOnLevelUp(cls)).toBe(true);
    }
  });

  it("is false for prepared casters and non-casters", () => {
    for (const cls of ["cleric", "druid", "paladin", "fighter", "barbarian", "monk"]) {
      expect(learnsNewSpellsOnLevelUp(cls)).toBe(false);
    }
  });
});
