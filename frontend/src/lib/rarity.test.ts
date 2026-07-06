import { describe, expect, it } from "vitest";

import {
  ITEM_RARITY_LABELS,
  RARITY_OPTIONS,
  rarityLabel,
  rarityValueHint,
  standardValueForRarity,
} from "@/lib/rarity";

describe("rarityLabel", () => {
  it("resolves enum keys to human labels", () => {
    expect(rarityLabel("VERY_RARE")).toBe("Very Rare");
    expect(rarityLabel("LEGENDARY")).toBe("Legendary");
  });

  it("degrades unknown keys to themselves", () => {
    expect(rarityLabel("MYTHIC")).toBe("MYTHIC");
  });

  it("covers all six tiers", () => {
    expect(Object.keys(ITEM_RARITY_LABELS)).toHaveLength(6);
    expect(RARITY_OPTIONS).toHaveLength(6);
    expect(RARITY_OPTIONS[0]).toEqual({ key: "COMMON", label: "Common" });
  });
});

describe("standardValueForRarity", () => {
  it("returns the tier value for a non-consumable", () => {
    expect(standardValueForRarity("RARE")).toBe(4000);
    expect(standardValueForRarity("LEGENDARY")).toBe(200000);
  });

  it("halves the value for a consumable", () => {
    expect(standardValueForRarity("RARE", { isConsumable: true })).toBe(2000);
  });

  it("keeps Artifact priceless (null) regardless of consumable", () => {
    expect(standardValueForRarity("ARTIFACT")).toBeNull();
    expect(standardValueForRarity("ARTIFACT", { isConsumable: true })).toBeNull();
  });

  it("returns null for null/undefined rarity", () => {
    expect(standardValueForRarity(null)).toBeNull();
    expect(standardValueForRarity(undefined)).toBeNull();
  });
});

describe("rarityValueHint", () => {
  it("formats the standard value with a thousands separator", () => {
    expect(rarityValueHint("VERY_RARE")).toBe("Standard value: 40,000 gp");
  });

  it("halves for a consumable", () => {
    expect(rarityValueHint("RARE", { isConsumable: true })).toBe("Standard value: 2,000 gp");
  });

  it("shows Priceless for Artifact", () => {
    expect(rarityValueHint("ARTIFACT")).toBe("Priceless");
  });

  it("returns null when no rarity is selected", () => {
    expect(rarityValueHint(null)).toBeNull();
    expect(rarityValueHint(undefined)).toBeNull();
  });
});
