import { describe, it, expect } from "vitest";

import { deriveArmorClass } from "../srd.js";

const leather = { armorCategory: "light" as const, baseArmorClass: 11 };
const halfPlate = { armorCategory: "medium" as const, baseArmorClass: 15, dexModifierMax: 2 };
const chainMail = { armorCategory: "heavy" as const, baseArmorClass: 16 };

describe("deriveArmorClass", () => {
  it("unarmored is 10 + Dex (positive and negative)", () => {
    expect(deriveArmorClass(null, false, 3)).toBe(13);
    expect(deriveArmorClass(null, false, -1)).toBe(9);
    expect(deriveArmorClass(null, false, 0)).toBe(10);
  });

  it("light armor adds full (uncapped) Dex", () => {
    expect(deriveArmorClass(leather, false, 4)).toBe(15);
    expect(deriveArmorClass(leather, false, -1)).toBe(10);
  });

  it("medium armor caps Dex at dexModifierMax", () => {
    expect(deriveArmorClass(halfPlate, false, 4)).toBe(17); // capped at +2
    expect(deriveArmorClass(halfPlate, false, 1)).toBe(16); // under cap
  });

  it("medium armor defaults the Dex cap to +2 when dexModifierMax is null/undefined", () => {
    const noCapNull = { armorCategory: "medium" as const, baseArmorClass: 14, dexModifierMax: null };
    const noCapUndef = { armorCategory: "medium" as const, baseArmorClass: 14 };
    expect(deriveArmorClass(noCapNull, false, 5)).toBe(16);
    expect(deriveArmorClass(noCapUndef, false, 5)).toBe(16);
  });

  it("heavy armor ignores Dex entirely", () => {
    expect(deriveArmorClass(chainMail, false, 3)).toBe(16);
    expect(deriveArmorClass(chainMail, false, -2)).toBe(16);
  });

  it("shield adds +2 in every category", () => {
    expect(deriveArmorClass(null, true, 2)).toBe(14);
    expect(deriveArmorClass(leather, true, 2)).toBe(15);
    expect(deriveArmorClass(halfPlate, true, 4)).toBe(19);
    expect(deriveArmorClass(chainMail, true, 3)).toBe(18);
  });

  it("heavy armor plus shield stacks correctly", () => {
    expect(deriveArmorClass(chainMail, true, 5)).toBe(18);
  });
});
