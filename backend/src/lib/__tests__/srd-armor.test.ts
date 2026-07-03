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

describe("deriveArmorClass — Unarmored Defense", () => {
  const ud = (classNames: string[], conMod: number, wisMod: number) => ({ classNames, conMod, wisMod });

  it("barbarian unarmored is 10 + Dex + Con, and shields stack", () => {
    expect(deriveArmorClass(null, false, 2, ud(["barbarian"], 3, 0))).toBe(15);
    expect(deriveArmorClass(null, true, 2, ud(["barbarian"], 3, 0))).toBe(17);
  });

  it("monk unarmored is 10 + Dex + Wis with no shield term", () => {
    expect(deriveArmorClass(null, false, 2, ud(["monk"], 0, 3))).toBe(15);
    // Monk 15 still beats base-with-shield 14.
    expect(deriveArmorClass(null, true, 2, ud(["monk"], 0, 3))).toBe(15);
  });

  it("low-Wis monk with a shield falls back to base + shield", () => {
    expect(deriveArmorClass(null, true, 2, ud(["monk"], 0, 0))).toBe(14); // base 14 > monk 12
  });

  it("barbarian/monk multiclass takes the highest formula", () => {
    expect(deriveArmorClass(null, false, 2, ud(["barbarian", "monk"], 1, 3))).toBe(15); // monk 15 > barb 13
    expect(deriveArmorClass(null, false, 2, ud(["barbarian", "monk"], 3, 1))).toBe(15); // barb 15 > monk 13
  });

  it("is ignored entirely while wearing body armor", () => {
    expect(deriveArmorClass(leather, false, 2, ud(["barbarian"], 5, 5))).toBe(deriveArmorClass(leather, false, 2));
    expect(deriveArmorClass(chainMail, true, 2, ud(["monk"], 5, 5))).toBe(deriveArmorClass(chainMail, true, 2));
  });

  it("never lowers AC below the base formula on a negative Con", () => {
    expect(deriveArmorClass(null, false, 2, ud(["barbarian"], -1, 0))).toBe(12); // base 12 > barb 11
  });

  it("does nothing for classes without Unarmored Defense", () => {
    expect(deriveArmorClass(null, false, 2, ud(["fighter"], 3, 3))).toBe(12);
  });

  it("matches class names case-insensitively", () => {
    expect(deriveArmorClass(null, false, 2, ud(["Barbarian"], 3, 0))).toBe(15);
    expect(deriveArmorClass(null, false, 2, ud(["Monk"], 0, 3))).toBe(15);
  });
});
