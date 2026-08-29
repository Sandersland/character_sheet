import { describe, it, expect } from "vitest";

import { primaryAbilities } from "@/lib/srd/primary-abilities.js";

describe("primaryAbilities", () => {
  it("passes through the class's PHB'24 primary abilities verbatim", () => {
    expect(primaryAbilities(["strength"])).toEqual(["strength"]);
    expect(primaryAbilities(["charisma"])).toEqual(["charisma"]);
    expect(primaryAbilities(["wisdom"])).toEqual(["wisdom"]);
    expect(primaryAbilities(["strength", "dexterity"])).toEqual(["strength", "dexterity"]);
    expect(primaryAbilities(["dexterity", "wisdom"])).toEqual(["dexterity", "wisdom"]);
  });

  it("returns [] for a homebrew class with no catalog row (null/undefined)", () => {
    expect(primaryAbilities(null)).toEqual([]);
    expect(primaryAbilities(undefined)).toEqual([]);
    expect(primaryAbilities([])).toEqual([]);
  });
});
