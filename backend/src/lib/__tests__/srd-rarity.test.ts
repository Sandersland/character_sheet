import { describe, expect, it } from "vitest";

import { ITEM_RARITIES, isKnownRarity, standardValueForRarity } from "../srd.js";

describe("item rarity (#497)", () => {
  it("orders the six tiers with their standard GP values", () => {
    expect(ITEM_RARITIES.map((r) => r.key)).toEqual([
      "COMMON",
      "UNCOMMON",
      "RARE",
      "VERY_RARE",
      "LEGENDARY",
      "ARTIFACT",
    ]);
    const byKey = Object.fromEntries(ITEM_RARITIES.map((r) => [r.key, r.standardValueGp]));
    expect(byKey.COMMON).toBe(100);
    expect(byKey.UNCOMMON).toBe(400);
    expect(byKey.RARE).toBe(4000);
    expect(byKey.VERY_RARE).toBe(40000);
    expect(byKey.LEGENDARY).toBe(200000);
    expect(byKey.ARTIFACT).toBeNull();
  });

  it("returns the standard value for a non-consumable rarity", () => {
    expect(standardValueForRarity("RARE", { isConsumable: false })).toBe(4000);
    expect(standardValueForRarity("LEGENDARY", { isConsumable: false })).toBe(200000);
  });

  it("halves the value for a consumable", () => {
    expect(standardValueForRarity("RARE", { isConsumable: true })).toBe(2000);
    expect(standardValueForRarity("UNCOMMON", { isConsumable: true })).toBe(200);
  });

  it("leaves Artifact priceless regardless of consumable flag", () => {
    expect(standardValueForRarity("ARTIFACT", { isConsumable: false })).toBeNull();
    expect(standardValueForRarity("ARTIFACT", { isConsumable: true })).toBeNull();
  });

  it("defaults isConsumable to false when options are omitted", () => {
    expect(standardValueForRarity("COMMON")).toBe(100);
  });

  it("returns null for a null/unknown rarity", () => {
    expect(standardValueForRarity(null)).toBeNull();
    expect(isKnownRarity("rare")).toBe(false);
    expect(isKnownRarity("RARE")).toBe(true);
    expect(isKnownRarity("MYTHIC")).toBe(false);
  });
});
