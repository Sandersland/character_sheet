import { describe, expect, it } from "vitest";

import {
  experienceProgress,
  levelForExperience,
  proficiencyBonusForLevel,
} from "@/lib/experience.js";

describe("levelForExperience", () => {
  it("treats 0 XP as level 1", () => {
    expect(levelForExperience(0)).toBe(1);
  });

  it("stays level 1 just below the level-2 threshold", () => {
    expect(levelForExperience(299)).toBe(1);
  });

  it("reaches level 2 exactly at the threshold", () => {
    expect(levelForExperience(300)).toBe(2);
  });

  it("stays level 19 just below the level-20 threshold", () => {
    expect(levelForExperience(354999)).toBe(19);
  });

  it("reaches level 20 exactly at the threshold", () => {
    expect(levelForExperience(355000)).toBe(20);
  });

  it("caps at level 20 for XP far beyond the table", () => {
    expect(levelForExperience(500000)).toBe(20);
  });
});

describe("proficiencyBonusForLevel", () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])("level %i has proficiency bonus +%i", (level, expected) => {
    expect(proficiencyBonusForLevel(level)).toBe(expected);
  });
});

describe("experienceProgress", () => {
  it("returns correct thresholds mid-progression", () => {
    expect(experienceProgress(1000)).toEqual({
      level: 3,
      proficiencyBonus: 2,
      currentLevelThreshold: 900,
      nextLevelThreshold: 2700,
    });
  });

  it("returns a null nextLevelThreshold and +6 proficiency at the level-20 cap", () => {
    expect(experienceProgress(500000)).toEqual({
      level: 20,
      proficiencyBonus: 6,
      currentLevelThreshold: 355000,
      nextLevelThreshold: null,
    });
  });
});
