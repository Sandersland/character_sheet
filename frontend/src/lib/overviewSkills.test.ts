import { describe, it, expect } from "vitest";

import { proficientSkills } from "@/lib/overviewSkills";
import type { Skill } from "@/types/character";

function skill(overrides: Partial<Skill> & Pick<Skill, "name" | "ability">): Skill {
  return { proficient: false, ...overrides };
}

describe("proficientSkills", () => {
  it("returns [] for an empty list", () => {
    expect(proficientSkills([])).toEqual([]);
  });

  it("keeps only proficient or expertise skills", () => {
    const skills: Skill[] = [
      skill({ name: "stealth", ability: "dexterity", proficient: true }),
      skill({ name: "arcana", ability: "intelligence", proficient: false }),
      skill({ name: "athletics", ability: "strength", proficient: false, expertise: true }),
    ];
    expect(proficientSkills(skills).map((s) => s.name)).toEqual(["athletics", "stealth"]);
  });

  it("includes an expertise-only skill even when proficient is false", () => {
    const skills: Skill[] = [
      skill({ name: "perception", ability: "wisdom", proficient: false, expertise: true }),
    ];
    expect(proficientSkills(skills).map((s) => s.name)).toEqual(["perception"]);
  });

  it("sorts by display label, not raw key", () => {
    const skills: Skill[] = [
      skill({ name: "stealth", ability: "dexterity", proficient: true }),
      skill({ name: "animalHandling", ability: "wisdom", proficient: true }),
      skill({ name: "sleightOfHand", ability: "dexterity", proficient: true }),
    ];
    // "Animal Handling" < "Sleight of Hand" < "Stealth".
    expect(proficientSkills(skills).map((s) => s.name)).toEqual([
      "animalHandling",
      "sleightOfHand",
      "stealth",
    ]);
  });
});
