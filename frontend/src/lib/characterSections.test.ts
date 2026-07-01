import { describe, it, expect } from "vitest";

import { hasAdvancements, hasProficiencies } from "@/lib/characterSections";
import type { Character } from "@/types/character";

function make(overrides: Partial<Character>): Character {
  return {
    toolProficiencies: [],
    advancements: [],
    advancementSlots: { total: 0, used: 0 },
    ...overrides,
  } as Character;
}

describe("hasProficiencies", () => {
  it("is false with nothing to show and no pending tool choice", () => {
    expect(hasProficiencies(make({}))).toBe(false);
  });

  it("is true for any populated proficiency list or pending tool choice", () => {
    expect(hasProficiencies(make({ toolProficiencies: ["smith"] }))).toBe(true);
    expect(hasProficiencies(make({ weaponProficiencies: ["longsword"] }))).toBe(true);
    expect(hasProficiencies(make({ armorProficiencies: ["light"] }))).toBe(true);
    expect(hasProficiencies(make({ resources: { toolProfChoiceCount: 1 } } as Partial<Character>))).toBe(true);
  });
});

describe("hasAdvancements", () => {
  it("is false with no slots and no advancements", () => {
    expect(hasAdvancements(make({}))).toBe(false);
  });

  it("is true when slots exist or advancements are recorded", () => {
    expect(hasAdvancements(make({ advancementSlots: { total: 1, used: 0 } }))).toBe(true);
    expect(hasAdvancements(make({ advancements: [{ id: "a1" }] } as Partial<Character>))).toBe(true);
  });
});
