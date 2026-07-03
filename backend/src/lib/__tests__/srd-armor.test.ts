import { describe, it, expect } from "vitest";

import { deriveArmorClass, deriveArmorClassParts } from "../srd.js";

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

const namedLeather = { name: "Leather", ...leather };
const namedHalfPlate = { name: "Half Plate", ...halfPlate };
const namedChainMail = { name: "Chain Mail", ...chainMail };

describe("deriveArmorClassParts", () => {
  it("unarmored is a base-10 part plus a Dex part", () => {
    expect(deriveArmorClassParts(null, false, 3)).toEqual([
      { label: "Unarmored", value: 10 },
      { label: "Dex", value: 3 },
    ]);
  });

  it("unarmored omits a zero Dex part", () => {
    expect(deriveArmorClassParts(null, false, 0)).toEqual([{ label: "Unarmored", value: 10 }]);
  });

  it("includes a negative Dex part", () => {
    expect(deriveArmorClassParts(null, false, -1)).toEqual([
      { label: "Unarmored", value: 10 },
      { label: "Dex", value: -1 },
    ]);
  });

  it("light armor is named base part plus full Dex", () => {
    expect(deriveArmorClassParts(namedLeather, false, 4)).toEqual([
      { label: "Leather", value: 11 },
      { label: "Dex", value: 4 },
    ]);
  });

  it("medium armor labels the Dex part with the cap when it binds", () => {
    expect(deriveArmorClassParts(namedHalfPlate, false, 4)).toEqual([
      { label: "Half Plate", value: 15 },
      { label: "Dex (max +2)", value: 2 },
    ]);
  });

  it("medium armor under the cap keeps the plain Dex label", () => {
    expect(deriveArmorClassParts(namedHalfPlate, false, 1)).toEqual([
      { label: "Half Plate", value: 15 },
      { label: "Dex", value: 1 },
    ]);
  });

  it("heavy armor emits no Dex part", () => {
    expect(deriveArmorClassParts(namedChainMail, false, 3)).toEqual([
      { label: "Chain Mail", value: 16 },
    ]);
  });

  it("shield appends a +2 part in every category", () => {
    expect(deriveArmorClassParts(null, true, 0)).toEqual([
      { label: "Unarmored", value: 10 },
      { label: "Shield", value: 2 },
    ]);
    expect(deriveArmorClassParts(namedChainMail, true, 3)).toEqual([
      { label: "Chain Mail", value: 16 },
      { label: "Shield", value: 2 },
    ]);
  });

  it("falls back to a generic label when the armor has no name", () => {
    expect(deriveArmorClassParts(leather, false, 0)).toEqual([{ label: "Armor", value: 11 }]);
  });

  it("emits labeled Unarmored Defense parts when a UD formula wins", () => {
    expect(deriveArmorClassParts(null, false, 2, { classNames: ["barbarian"], conMod: 3, wisMod: 0 })).toEqual([
      { label: "Unarmored Defense", value: 10 },
      { label: "Dex", value: 2 },
      { label: "Con", value: 3 },
    ]);
    expect(deriveArmorClassParts(null, false, 2, { classNames: ["monk"], conMod: 0, wisMod: 3 })).toEqual([
      { label: "Unarmored Defense", value: 10 },
      { label: "Dex", value: 2 },
      { label: "Wis", value: 3 },
    ]);
  });

  it("keeps the base Unarmored parts when a shield disqualifies the monk formula", () => {
    expect(deriveArmorClassParts(null, true, 2, { classNames: ["monk"], conMod: 0, wisMod: 3 })).toEqual([
      { label: "Unarmored", value: 10 },
      { label: "Dex", value: 2 },
      { label: "Shield", value: 2 },
    ]);
  });

  it("parts sum to deriveArmorClass for every fixture", () => {
    const armors = [null, leather, halfPlate, chainMail, namedLeather, namedHalfPlate, namedChainMail];
    const uds = [undefined, { classNames: ["barbarian"], conMod: 3, wisMod: 0 }, { classNames: ["monk"], conMod: 0, wisMod: 4 }];
    for (const armor of armors) {
      for (const hasShield of [false, true]) {
        for (const dexMod of [-2, -1, 0, 1, 2, 3, 4, 5]) {
          for (const ud of uds) {
            const sum = deriveArmorClassParts(armor, hasShield, dexMod, ud).reduce((t, p) => t + p.value, 0);
            expect(sum).toBe(deriveArmorClass(armor, hasShield, dexMod, ud));
          }
        }
      }
    }
  });
});

describe("deriveArmorClass — Unarmored Defense", () => {
  const ud = (classNames: string[], conMod: number, wisMod: number) => ({ classNames, conMod, wisMod });

  it("barbarian unarmored is 10 + Dex + Con, and shields stack", () => {
    expect(deriveArmorClass(null, false, 2, ud(["barbarian"], 3, 0))).toBe(15);
    expect(deriveArmorClass(null, true, 2, ud(["barbarian"], 3, 0))).toBe(17);
  });

  it("monk unarmored is 10 + Dex + Wis", () => {
    expect(deriveArmorClass(null, false, 2, ud(["monk"], 0, 3))).toBe(15);
  });

  it("monk with a shield falls back to base + shield even with high Wis", () => {
    // PHB p.78: a shield disqualifies Monk Unarmored Defense entirely.
    expect(deriveArmorClass(null, true, 2, ud(["monk"], 0, 3))).toBe(14); // base+shield 14, not monk 15
    expect(deriveArmorClass(null, true, 2, ud(["monk"], 0, 0))).toBe(14);
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
