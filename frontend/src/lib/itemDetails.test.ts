import { describe, it, expect } from "vitest";

import { hasItemProse, itemDetailParts } from "@/lib/itemDetails";
import type { InventoryItem } from "@/types/character";

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return { id: "i1", name: "Thing", category: "gear", quantity: 1, equipped: false, ...overrides };
}

describe("itemDetailParts", () => {
  it("leads with quantity and weight (weight × quantity)", () => {
    const parts = itemDetailParts(makeItem({ quantity: 3, weight: 2 }));
    expect(parts[0]).toBe("3x");
    expect(parts).toContain("6 lb");
  });

  it("renders weapon damage, versatile grip, and property tags", () => {
    const parts = itemDetailParts(
      makeItem({
        category: "weapon",
        weapon: {
          damageDiceCount: 1,
          damageDiceFaces: 8,
          damageModifier: 0,
          damageType: "slashing",
          versatileDiceCount: 1,
          versatileDiceFaces: 10,
          finesse: true,
          light: false,
          heavy: false,
          twoHanded: false,
          reach: false,
          thrown: false,
          ammunition: false,
        },
      })
    );
    expect(parts).toContain("1d8 slashing");
    expect(parts).toContain("versatile: 1d10");
    expect(parts).toContain("finesse");
  });

  it("renders armor AC with a capped Dex modifier", () => {
    const parts = itemDetailParts(
      makeItem({
        category: "armor",
        armor: {
          armorCategory: "medium",
          baseArmorClass: 14,
          dexModifierApplies: true,
          dexModifierMax: 2,
          stealthDisadvantage: true,
        },
      })
    );
    expect(parts).toContain("AC 14 + Dex (max 2)");
    expect(parts).toContain("stealth disadvantage");
  });
});

describe("hasItemProse", () => {
  it("is false with no description, effect, or notes", () => {
    expect(hasItemProse(makeItem())).toBe(false);
  });

  it("is true when any prose source is present", () => {
    expect(hasItemProse(makeItem({ description: "d" }))).toBe(true);
    expect(hasItemProse(makeItem({ notes: "n" }))).toBe(true);
    expect(
      hasItemProse(makeItem({ category: "consumable", consumable: { effectDescription: "heal" } }))
    ).toBe(true);
  });
});
