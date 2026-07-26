import { describe, expect, it } from "vitest";

import { CONDITIONS, conditionDefinition } from "@/lib/srd/condition-data.js";

// #1309: the 2014 half of what #1135 replaced. Nine conditions carry real
// mechanical or textual deltas from PHB'14 to SRD 5.2; the other five are
// byte-identical across editions and must resolve to the exact same object
// (not a duplicated row) in both.
describe("conditionDefinition — 2014 divergent conditions (#1309, PHB'14 pp. 290-292 Appendix A)", () => {
  it("charmed: 2014 description differs from 2024's; rollEffects stay absent in both", () => {
    const c2014 = conditionDefinition("charmed", "EDITION_2014");
    const c2024 = conditionDefinition("charmed", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.description).toBe(
      "Can't attack the charmer or target it with harmful abilities or magical effects. The charmer has advantage on ability checks to interact socially with the creature.",
    );
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toBeUndefined();
  });

  it("grappled: 2014 has no rollEffects; 2024 grants disadvantage on attack", () => {
    const c2014 = conditionDefinition("grappled", "EDITION_2014");
    const c2024 = conditionDefinition("grappled", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "attack" }]);
  });

  it("incapacitated: 2014 has no rollEffects; 2024 grants disadvantage on initiative", () => {
    const c2014 = conditionDefinition("incapacitated", "EDITION_2014");
    const c2024 = conditionDefinition("incapacitated", "EDITION_2024");
    expect(c2014.description).toBe("Can't take actions or reactions.");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("invisible: 2014 grants advantage on attack only; 2024 adds advantage on initiative too", () => {
    const c2014 = conditionDefinition("invisible", "EDITION_2014");
    const c2024 = conditionDefinition("invisible", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toEqual([{ mode: "advantage", kind: "attack" }]);
    expect(c2024.rollEffects).toEqual([
      { mode: "advantage", kind: "initiative" },
      { mode: "advantage", kind: "attack" },
    ]);
  });

  it("paralyzed: 2014 has no rollEffects; 2024 grants disadvantage on initiative (Incapacitated inheritance)", () => {
    const c2014 = conditionDefinition("paralyzed", "EDITION_2014");
    const c2024 = conditionDefinition("paralyzed", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("petrified: 2014 has no rollEffects; 2024 grants disadvantage on initiative (Incapacitated inheritance)", () => {
    const c2014 = conditionDefinition("petrified", "EDITION_2014");
    const c2024 = conditionDefinition("petrified", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("petrified: 2014 description includes the auto-failed saves and advantage-to-hit clauses (PHB'14 p. 291) that a prior transcription dropped", () => {
    const c2014 = conditionDefinition("petrified", "EDITION_2014");
    expect(c2014.description).toBe(
      "Transformed, along with nonmagical objects it is wearing or carrying, into a solid inanimate substance. Incapacitated, can't move or speak, and is unaware of its surroundings. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage. Resistant to all damage; immune to poison and disease.",
    );
  });

  it("prone: description differs, but rollEffects (disadvantage on attack) stay identical", () => {
    const c2014 = conditionDefinition("prone", "EDITION_2014");
    const c2024 = conditionDefinition("prone", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toEqual([{ mode: "disadvantage", kind: "attack" }]);
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "attack" }]);
  });

  it("stunned: 2014 has no rollEffects; 2024 grants disadvantage on initiative (Incapacitated inheritance)", () => {
    const c2014 = conditionDefinition("stunned", "EDITION_2014");
    const c2024 = conditionDefinition("stunned", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("unconscious: 2014 has no rollEffects; 2024 grants disadvantage on initiative + attack", () => {
    const c2014 = conditionDefinition("unconscious", "EDITION_2014");
    const c2024 = conditionDefinition("unconscious", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([
      { mode: "disadvantage", kind: "initiative" },
      { mode: "disadvantage", kind: "attack" },
    ]);
  });
});

// The remaining 5 conditions are byte-identical across editions; a
// duplicated row per edition would defeat the point of the sparse override
// map, so this pins reference equality, not just deep equality.
describe("conditionDefinition — byte-identical conditions resolve to one shared object (#1309)", () => {
  it.each(["blinded", "deafened", "frightened", "poisoned", "restrained"] as const)(
    "%s: 2014 and 2024 lookups return the exact same CONDITIONS row",
    (key) => {
      const c2014 = conditionDefinition(key, "EDITION_2014");
      const c2024 = conditionDefinition(key, "EDITION_2024");
      expect(c2014).toBe(c2024);
      expect(c2014).toBe(CONDITIONS.find((c) => c.key === key));
    },
  );
});
