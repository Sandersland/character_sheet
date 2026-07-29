import { describe, expect, it } from "vitest";

import { rarityLabel, rarityOptions, rarityTone, rarityValueHint, standardValueForRarity } from "@/lib/rarity";
import { SERVED_RARITIES } from "@/test/rarities";

describe("rarityLabel", () => {
  it("resolves enum keys to the served labels", () => {
    expect(rarityLabel("VERY_RARE", SERVED_RARITIES)).toBe("Very Rare");
    expect(rarityLabel("LEGENDARY", SERVED_RARITIES)).toBe("Legendary");
  });

  it("returns null — never the raw key — for an unknown tier", () => {
    expect(rarityLabel("MYTHIC", SERVED_RARITIES)).toBeNull();
  });

  it("returns null while the served rows are unresolved", () => {
    expect(rarityLabel("VERY_RARE", [])).toBeNull();
  });
});

describe("rarityOptions", () => {
  it("keeps the server's ascending tier order and narrows to key + label", () => {
    expect(rarityOptions(SERVED_RARITIES)).toEqual([
      { key: "COMMON", label: "Common" },
      { key: "UNCOMMON", label: "Uncommon" },
      { key: "RARE", label: "Rare" },
      { key: "VERY_RARE", label: "Very Rare" },
      { key: "LEGENDARY", label: "Legendary" },
      { key: "ARTIFACT", label: "Artifact" },
    ]);
  });

  it("is empty while the served rows are unresolved", () => {
    expect(rarityOptions([])).toEqual([]);
  });
});

describe("rarityTone", () => {
  it("stays a client-side design token, resolved from the key alone", () => {
    expect(rarityTone("LEGENDARY")).toBe("gold");
    expect(rarityTone("COMMON")).toBe("neutral");
  });
});

describe("standardValueForRarity", () => {
  it("returns the tier value for a non-consumable", () => {
    expect(standardValueForRarity("RARE", SERVED_RARITIES)).toBe(4000);
    expect(standardValueForRarity("LEGENDARY", SERVED_RARITIES)).toBe(200000);
  });

  it("halves the value for a consumable", () => {
    expect(standardValueForRarity("RARE", SERVED_RARITIES, { isConsumable: true })).toBe(2000);
  });

  it("keeps Artifact priceless (null) regardless of consumable", () => {
    expect(standardValueForRarity("ARTIFACT", SERVED_RARITIES)).toBeNull();
    expect(standardValueForRarity("ARTIFACT", SERVED_RARITIES, { isConsumable: true })).toBeNull();
  });

  it("returns null for null/undefined rarity", () => {
    expect(standardValueForRarity(null, SERVED_RARITIES)).toBeNull();
    expect(standardValueForRarity(undefined, SERVED_RARITIES)).toBeNull();
  });

  it("returns null while the served rows are unresolved — no gp figure survives client-side", () => {
    expect(standardValueForRarity("RARE", [])).toBeNull();
  });
});

describe("rarityValueHint", () => {
  it("formats the standard value with a thousands separator", () => {
    expect(rarityValueHint("VERY_RARE", SERVED_RARITIES)).toBe("Standard value: 40,000 gp");
  });

  it("halves for a consumable", () => {
    expect(rarityValueHint("RARE", SERVED_RARITIES, { isConsumable: true })).toBe("Standard value: 2,000 gp");
  });

  it("shows Priceless for Artifact", () => {
    expect(rarityValueHint("ARTIFACT", SERVED_RARITIES)).toBe("Priceless");
  });

  it("returns null when no rarity is selected", () => {
    expect(rarityValueHint(null, SERVED_RARITIES)).toBeNull();
    expect(rarityValueHint(undefined, SERVED_RARITIES)).toBeNull();
  });

  it("returns null while the served rows are unresolved", () => {
    expect(rarityValueHint("VERY_RARE", [])).toBeNull();
  });

  // "Priceless" is presentation, not a served value — it holds even before the
  // rows land, because ARTIFACT's standardValueGp is null either way.
  it("still shows Priceless for Artifact with no served rows", () => {
    expect(rarityValueHint("ARTIFACT", [])).toBe("Priceless");
  });
});
