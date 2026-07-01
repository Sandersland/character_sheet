import { describe, it, expect } from "vitest";

import { hasAdvancements, hasProficiencies } from "@/lib/characterSections";
import type { Character } from "@/types/character";

function make(overrides: Record<string, unknown>): Character {
  return {
    toolProficiencies: [],
    advancements: [],
    advancementSlots: { total: 0, used: 0 },
    ...overrides,
  } as unknown as Character;
}

describe("hasProficiencies", () => {
  it("is false with nothing to show and no pending tool choice", () => {
    expect(hasProficiencies(make({}))).toBe(false);
  });

  it("is true for any populated proficiency list or pending tool choice", () => {
    expect(hasProficiencies(make({ toolProficiencies: [{ name: "smith" }] }))).toBe(true);
    expect(hasProficiencies(make({ weaponProficiencies: [{ name: "longsword" }] }))).toBe(true);
    expect(hasProficiencies(make({ armorProficiencies: [{ name: "light" }] }))).toBe(true);
    expect(hasProficiencies(make({ resources: { toolProfChoiceCount: 1 } }))).toBe(true);
  });
});

describe("hasAdvancements", () => {
  it("is false with no slots and no advancements", () => {
    expect(hasAdvancements(make({}))).toBe(false);
  });

  it("is true when slots exist or advancements are recorded", () => {
    expect(hasAdvancements(make({ advancementSlots: { total: 1, used: 0 } }))).toBe(true);
    expect(hasAdvancements(make({ advancements: [{ id: "a1" }] }))).toBe(true);
  });
});
