import { describe, expect, it } from "vitest";

import { classEntryLevel, classSummary, isMulticlass, multiclassPrereqMet } from "@/lib/multiclass";
import type { AbilityScores, Character, ClassOption } from "@/types/character";

const scores = (over: Partial<AbilityScores> = {}): AbilityScores => ({
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  ...over,
});

describe("isMulticlass", () => {
  it("is false for zero or one class", () => {
    expect(isMulticlass(undefined)).toBe(false);
    expect(isMulticlass([{ name: "Wizard", level: 5 }])).toBe(false);
  });

  it("is true for two or more classes", () => {
    expect(isMulticlass([{ name: "Wizard", level: 5 }, { name: "Cleric", level: 3 }])).toBe(true);
  });
});

describe("classSummary", () => {
  it("renders a single class unchanged (name only)", () => {
    expect(classSummary([{ name: "Wizard", level: 5 }], { name: "Wizard" })).toBe("Wizard");
  });

  it("appends the subclass in parens for a single class", () => {
    expect(
      classSummary([{ name: "Wizard", level: 5, subclass: "Evocation" }], { name: "Wizard" }),
    ).toBe("Wizard (Evocation)");
  });

  it("falls back when no classes array is present", () => {
    expect(classSummary(undefined, { name: "Rogue", subclass: "Thief" })).toBe("Rogue (Thief)");
  });

  it("joins multiclass entries with per-class levels", () => {
    expect(
      classSummary(
        [{ name: "Wizard", level: 5 }, { name: "Cleric", level: 3 }],
        { name: "Wizard" },
      ),
    ).toBe("Wizard 5 / Cleric 3");
  });

  it("includes each entry's subclass in a multiclass line", () => {
    expect(
      classSummary(
        [{ name: "Wizard", level: 5, subclass: "Evocation" }, { name: "Cleric", level: 3 }],
        { name: "Wizard" },
      ),
    ).toBe("Wizard 5 (Evocation) / Cleric 3");
  });
});

describe("classEntryLevel", () => {
  it("returns the entry's own level for a multiclass character", () => {
    const character = {
      level: 13,
      class: "Monk",
      classes: [
        { name: "Monk", level: 3 },
        { name: "Fighter", level: 10 },
      ],
    } as unknown as Character;
    expect(classEntryLevel(character, "monk")).toBe(3);
    expect(classEntryLevel(character, "fighter")).toBe(10);
  });

  it("matches case-insensitively against title-case served names", () => {
    const character = { level: 3, classes: [{ name: "Monk", level: 3 }] } as unknown as Character;
    expect(classEntryLevel(character, "monk")).toBe(3);
  });

  it("uses the XP-derived character level for a single-class character, even when the entry's own level column is stale", () => {
    const character = {
      level: 7,
      classes: [{ name: "Monk", level: 1 }],
    } as unknown as Character;
    expect(classEntryLevel(character, "monk")).toBe(7);
  });

  it("falls back to character.class + character.level when classes is absent", () => {
    const character = { level: 7, class: "Monk" } as unknown as Character;
    expect(classEntryLevel(character, "monk")).toBe(7);
  });

  it("returns 0 for a class the character does not have", () => {
    const character = { level: 13, classes: [{ name: "Fighter", level: 10 }] } as unknown as Character;
    expect(classEntryLevel(character, "monk")).toBe(0);
  });

  it("returns 0 when classes is absent and the name doesn't match character.class", () => {
    const character = { level: 7, class: "Rogue" } as unknown as Character;
    expect(classEntryLevel(character, "monk")).toBe(0);
  });
});

describe("multiclassPrereqMet", () => {
  const wizardReq: ClassOption["multiclassPrerequisite"] = {
    options: [{ intelligence: 13 }],
    description: "Intelligence 13",
  };
  const fighterReq: ClassOption["multiclassPrerequisite"] = {
    options: [{ strength: 13 }, { dexterity: 13 }],
    description: "Strength 13 or Dexterity 13",
  };

  it("treats no prerequisite as always met", () => {
    expect(multiclassPrereqMet(null, scores())).toBe(true);
  });

  it("requires the single ability threshold", () => {
    expect(multiclassPrereqMet(wizardReq, scores({ intelligence: 12 }))).toBe(false);
    expect(multiclassPrereqMet(wizardReq, scores({ intelligence: 13 }))).toBe(true);
  });

  it("is met when ANY option is satisfied (OR class)", () => {
    expect(multiclassPrereqMet(fighterReq, scores())).toBe(false);
    expect(multiclassPrereqMet(fighterReq, scores({ dexterity: 13 }))).toBe(true);
  });
});
