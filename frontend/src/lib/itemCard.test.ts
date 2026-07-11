import { describe, expect, it } from "vitest";

import { diceLabel, itemDetailRows } from "@/lib/itemCard";
import type { CampaignItem } from "@/types/character";

function item(overrides: Partial<CampaignItem> = {}): CampaignItem {
  return {
    id: "item-1",
    campaignId: "camp-1",
    name: "Test Item",
    category: "gear",
    requiresAttunement: false,
    isUnique: false,
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("diceLabel", () => {
  it("formats positive/negative/absent modifiers", () => {
    expect(diceLabel(2, 4, 2)).toBe("2d4 + 2");
    expect(diceLabel(1, 8, -1)).toBe("1d8 - 1");
    expect(diceLabel(1, 8, 0)).toBe("1d8");
    expect(diceLabel(1, 8)).toBe("1d8");
  });

  it("returns null without a count or faces", () => {
    expect(diceLabel(undefined, 8)).toBeNull();
    expect(diceLabel(1, undefined)).toBeNull();
    expect(diceLabel(0, 8)).toBeNull();
  });
});

describe("itemDetailRows", () => {
  it("orders weight, value, then category detail", () => {
    expect(
      itemDetailRows(
        item({
          weight: 3,
          cost: { cp: 0, sp: 0, gp: 5000, pp: 0 },
          weapon: {
            damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing",
            finesse: true, light: false, heavy: false, twoHanded: false, reach: false,
            thrown: false, ammunition: false, versatileDiceCount: 1, versatileDiceFaces: 10,
          },
        }),
      ),
    ).toEqual([
      { label: "Weight", value: "3 lb" },
      { label: "Value", value: "5000 gp" },
      { label: "Damage", value: "1d8 slashing" },
      { label: "Property", value: "Finesse" },
      { label: "Versatile", value: "1d10" },
    ]);
  });

  it("armor rows: AC and type always, stealth only on disadvantage", () => {
    expect(
      itemDetailRows(item({ armor: { armorCategory: "heavy", baseArmorClass: 20, dexModifierApplies: false, stealthDisadvantage: true } })),
    ).toEqual([
      { label: "Armor class", value: "20" },
      { label: "Armor type", value: "heavy" },
      { label: "Stealth", value: "Disadvantage" },
    ]);
    expect(
      itemDetailRows(item({ armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true, stealthDisadvantage: false } })),
    ).toEqual([
      { label: "Armor class", value: "11" },
      { label: "Armor type", value: "light" },
    ]);
  });

  it("consumable effect joins dice and description with an em dash; omits an empty effect", () => {
    expect(
      itemDetailRows(item({ consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Regain HP" } })),
    ).toEqual([{ label: "Effect", value: "2d4 + 2 — Regain HP" }]);
    expect(itemDetailRows(item({ consumable: { effectDescription: "Cures poison" } }))).toEqual([
      { label: "Effect", value: "Cures poison" },
    ]);
    expect(itemDetailRows(item({ consumable: {} }))).toEqual([]);
  });

  it("a bare item yields no rows", () => {
    expect(itemDetailRows(item())).toEqual([]);
  });
});
