import { describe, it, expect } from "vitest";

import { multiclassPrerequisitesMet, type MulticlassPrerequisiteOption } from "@/lib/srd/srd.js";

const BASE = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

describe("multiclassPrerequisitesMet", () => {
  it("single-ability class (Wizard): met only at INT 13+", () => {
    const wizard = [{ intelligence: 13 }];
    expect(multiclassPrerequisitesMet(wizard, { ...BASE, intelligence: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet(wizard, { ...BASE, intelligence: 12 }).met).toBe(false);
  });

  it("OR class (Fighter): met when either STR 13 or DEX 13", () => {
    const fighter: MulticlassPrerequisiteOption[] = [{ strength: 13 }, { dexterity: 13 }];
    expect(multiclassPrerequisitesMet(fighter, { ...BASE, strength: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet(fighter, { ...BASE, dexterity: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet(fighter, { ...BASE }).met).toBe(false);
  });

  it("AND class (Paladin): needs both STR 13 and CHA 13", () => {
    const paladin = [{ strength: 13, charisma: 13 }];
    expect(multiclassPrerequisitesMet(paladin, { ...BASE, strength: 13, charisma: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet(paladin, { ...BASE, strength: 13 }).met).toBe(false);
    expect(multiclassPrerequisitesMet(paladin, { ...BASE, charisma: 13 }).met).toBe(false);
  });

  it("homebrew class (no catalog row: null/undefined/[]) has no prerequisite (always met)", () => {
    for (const options of [null, undefined, []]) {
      const res = multiclassPrerequisitesMet(options, { ...BASE });
      expect(res.met).toBe(true);
      expect(res.description).toBe("");
    }
  });

  it("carries a human-readable requirement description", () => {
    expect(multiclassPrerequisitesMet([{ strength: 13 }, { dexterity: 13 }], BASE).description).toBe(
      "Strength 13 or Dexterity 13",
    );
    expect(multiclassPrerequisitesMet([{ strength: 13, charisma: 13 }], BASE).description).toBe(
      "Strength 13 and Charisma 13",
    );
  });
});
