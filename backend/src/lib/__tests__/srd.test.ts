import { describe, expect, it } from "vitest";

import { deriveResources } from "../srd.js";

const ABILITY_SCORES = {
  strength: 16, dexterity: 10, constitution: 14,
  intelligence: 10, wisdom: 10, charisma: 10,
};
const PROF_2 = 2;

describe("deriveResources — Battle Master grant-level guard", () => {
  it("returns null below subclassLevel 3 (level 1)", () => {
    expect(deriveResources("fighter", "battle master", 1, ABILITY_SCORES, PROF_2)).toBeNull();
  });

  it("returns null below subclassLevel 3 (level 2)", () => {
    expect(deriveResources("fighter", "battle master", 2, ABILITY_SCORES, PROF_2)).toBeNull();
  });

  it("returns a pool with superiorityDice at level 3 (grant level)", () => {
    const result = deriveResources("fighter", "battle master", 3, ABILITY_SCORES, PROF_2);
    expect(result).not.toBeNull();
    expect(result!.resources.length).toBeGreaterThan(0);
    expect(result!.resources[0].key).toBe("superiorityDice");
  });

  it("returns null for an unrecognised subclass", () => {
    expect(deriveResources("fighter", "purple dragon knight", 5, ABILITY_SCORES, PROF_2)).toBeNull();
  });

  it("returns null when subclass is undefined", () => {
    expect(deriveResources("fighter", undefined, 5, ABILITY_SCORES, PROF_2)).toBeNull();
  });
});
