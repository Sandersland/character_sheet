import { describe, it, expect } from "vitest";

import { primaryAbilities } from "@/lib/srd/primary-abilities.js";

describe("primaryAbilities", () => {
  it("returns the PHB'24 class-table primary abilities for every class", () => {
    expect(primaryAbilities("barbarian")).toEqual(["strength"]);
    expect(primaryAbilities("bard")).toEqual(["charisma"]);
    expect(primaryAbilities("cleric")).toEqual(["wisdom"]);
    expect(primaryAbilities("druid")).toEqual(["wisdom"]);
    expect(primaryAbilities("fighter")).toEqual(["strength", "dexterity"]);
    expect(primaryAbilities("monk")).toEqual(["dexterity", "wisdom"]);
    expect(primaryAbilities("paladin")).toEqual(["strength", "charisma"]);
    expect(primaryAbilities("ranger")).toEqual(["dexterity", "wisdom"]);
    expect(primaryAbilities("rogue")).toEqual(["dexterity"]);
    expect(primaryAbilities("sorcerer")).toEqual(["charisma"]);
    expect(primaryAbilities("warlock")).toEqual(["charisma"]);
    expect(primaryAbilities("wizard")).toEqual(["intelligence"]);
  });

  it("is case-insensitive", () => {
    expect(primaryAbilities("Fighter")).toEqual(["strength", "dexterity"]);
    expect(primaryAbilities("WIZARD")).toEqual(["intelligence"]);
  });

  it("returns [] for an unknown / homebrew class", () => {
    expect(primaryAbilities("Warden")).toEqual([]);
    expect(primaryAbilities("")).toEqual([]);
  });
});
