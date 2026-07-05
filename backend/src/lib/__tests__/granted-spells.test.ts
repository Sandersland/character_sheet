import { describe, it, expect } from "vitest";

import { deriveGrantedSpells, deriveGrantedCastingAbility } from "../granted-spells.js";

describe("deriveGrantedSpells", () => {
  it("grants Minor Illusion to a Way of Shadow monk at level 3", () => {
    const granted = deriveGrantedSpells("Monk", "Way of Shadow", 3);
    expect(granted).toHaveLength(1);
    const [spell] = granted;
    expect(spell.name).toBe("Minor Illusion");
    expect(spell.level).toBe(0);
    expect(spell.school).toBe("illusion");
    expect(spell.source).toBe("subclass");
    expect(spell.prepared).toBe(true);
    expect(spell.id).toBe("granted:way-of-shadow:minor-illusion");
  });

  it("grants nothing below the gate level", () => {
    expect(deriveGrantedSpells("Monk", "Way of Shadow", 2)).toEqual([]);
  });

  it("grants nothing for a monk subclass with no granted spells", () => {
    expect(deriveGrantedSpells("Monk", "Way of the Open Hand", 3)).toEqual([]);
  });

  it("grants nothing for a non-monk with no relevant subclass", () => {
    expect(deriveGrantedSpells("Fighter", undefined, 20)).toEqual([]);
  });

  it("returns independent nested components objects across calls", () => {
    const first = deriveGrantedSpells("Monk", "Way of Shadow", 3);
    const second = deriveGrantedSpells("Monk", "Way of Shadow", 3);
    expect(first[0].components).not.toBe(second[0].components);
    first[0].components!.verbal = false;
    expect(second[0].components!.verbal).toBe(true);
  });
});

describe("deriveGrantedCastingAbility", () => {
  it("returns the rule's casting ability for Way of Shadow", () => {
    expect(deriveGrantedCastingAbility("Way of Shadow")).toBe("wisdom");
  });

  it("defaults to wisdom for an unknown subclass", () => {
    expect(deriveGrantedCastingAbility("Way of the Open Hand")).toBe("wisdom");
  });

  it("defaults to wisdom when no subclass is set", () => {
    expect(deriveGrantedCastingAbility(undefined)).toBe("wisdom");
  });
});
