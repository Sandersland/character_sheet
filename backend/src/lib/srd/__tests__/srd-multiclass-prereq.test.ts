import { describe, it, expect } from "vitest";

import { multiclassPrerequisitesMet } from "@/lib/srd/srd.js";

const BASE = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

describe("multiclassPrerequisitesMet", () => {
  it("single-ability class (Wizard): met only at INT 13+", () => {
    expect(multiclassPrerequisitesMet("Wizard", { ...BASE, intelligence: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet("Wizard", { ...BASE, intelligence: 12 }).met).toBe(false);
  });

  it("OR class (Fighter): met when either STR 13 or DEX 13", () => {
    expect(multiclassPrerequisitesMet("Fighter", { ...BASE, strength: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet("Fighter", { ...BASE, dexterity: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet("Fighter", { ...BASE }).met).toBe(false);
  });

  it("AND class (Paladin): needs both STR 13 and CHA 13", () => {
    expect(multiclassPrerequisitesMet("Paladin", { ...BASE, strength: 13, charisma: 13 }).met).toBe(true);
    expect(multiclassPrerequisitesMet("Paladin", { ...BASE, strength: 13 }).met).toBe(false);
    expect(multiclassPrerequisitesMet("Paladin", { ...BASE, charisma: 13 }).met).toBe(false);
  });

  it("case-insensitive class name", () => {
    expect(multiclassPrerequisitesMet("rogue", { ...BASE, dexterity: 13 }).met).toBe(true);
  });

  it("unknown / homebrew class has no prerequisite (always met)", () => {
    const res = multiclassPrerequisitesMet("Homebrew Warden", { ...BASE });
    expect(res.met).toBe(true);
    expect(res.description).toBe("");
  });

  it("carries a human-readable requirement description", () => {
    expect(multiclassPrerequisitesMet("Fighter", BASE).description).toBe("Strength 13 or Dexterity 13");
    expect(multiclassPrerequisitesMet("Paladin", BASE).description).toBe("Strength 13 and Charisma 13");
  });
});
