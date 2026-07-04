import { describe, it, expect } from "vitest";

import { deriveAttacksPerAction } from "../srd.js";

const single = (name: string, level: number, subclass?: string) =>
  deriveAttacksPerAction([{ name, level, subclass }]);

describe("deriveAttacksPerAction — fighter", () => {
  it("scales 1/2/3/4 at levels 4/5/11/20", () => {
    expect(single("fighter", 4)).toBe(1);
    expect(single("fighter", 5)).toBe(2);
    expect(single("fighter", 11)).toBe(3);
    expect(single("fighter", 20)).toBe(4);
  });

  it("is case-insensitive", () => {
    expect(single("FIGHTER", 5)).toBe(2);
    expect(single("Fighter", 11)).toBe(3);
  });
});

describe("deriveAttacksPerAction — barbarian / monk / paladin / ranger", () => {
  for (const cls of ["barbarian", "monk", "paladin", "ranger"]) {
    it(`${cls}: 1 below L5, 2 at L5+ with no further scaling`, () => {
      expect(single(cls, 4)).toBe(1);
      expect(single(cls, 5)).toBe(2);
      expect(single(cls, 20)).toBe(2);
    });
  }
});

describe("deriveAttacksPerAction — no Extra Attack classes", () => {
  for (const cls of ["wizard", "cleric", "rogue", "sorcerer", "warlock", "druid"]) {
    it(`${cls}: always 1`, () => {
      expect(single(cls, 20)).toBe(1);
    });
  }

  it("bard base class never gets Extra Attack", () => {
    expect(single("bard", 20)).toBe(1);
  });
});

describe("deriveAttacksPerAction — multiclass takes the max (never summed)", () => {
  it("Fighter 5 / Ranger 5 → 2", () => {
    expect(
      deriveAttacksPerAction([
        { name: "fighter", level: 5 },
        { name: "ranger", level: 5 },
      ]),
    ).toBe(2);
  });

  it("Fighter 11 / Monk 5 → 3", () => {
    expect(
      deriveAttacksPerAction([
        { name: "fighter", level: 11 },
        { name: "monk", level: 5 },
      ]),
    ).toBe(3);
  });

  it("Wizard 20 / Rogue 20 → 1 (no Extra Attack on either)", () => {
    expect(
      deriveAttacksPerAction([
        { name: "wizard", level: 20 },
        { name: "rogue", level: 20 },
      ]),
    ).toBe(1);
  });

  it("empty class list → 1", () => {
    expect(deriveAttacksPerAction([])).toBe(1);
  });
});

describe("deriveAttacksPerAction — College of Valor bard", () => {
  it("grants a second attack at bard level 6, not before", () => {
    expect(single("bard", 5, "College of Valor")).toBe(1);
    expect(single("bard", 6, "College of Valor")).toBe(2);
  });

  it("other bard colleges never get Extra Attack", () => {
    expect(single("bard", 10, "College of Lore")).toBe(1);
  });
});
