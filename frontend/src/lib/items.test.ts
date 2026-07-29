import { describe, expect, it } from "vitest";

import {
  ITEM_CATEGORY_LABELS,
  ITEM_CATEGORY_OPTIONS,
  ITEM_CATEGORY_ORDER,
  itemCategoryLabel,
} from "@/lib/items";

describe("item category labels", () => {
  it("maps all four categories to plural labels", () => {
    expect(ITEM_CATEGORY_LABELS).toEqual({
      weapon: "Weapons",
      armor: "Armor",
      gear: "Gear",
      consumable: "Consumables",
    });
  });

  it("locks display order to weapon → armor → gear → consumable", () => {
    expect(ITEM_CATEGORY_ORDER).toEqual([
      "weapon",
      "armor",
      "gear",
      "consumable",
    ]);
  });

  it("derives options from order without drift", () => {
    expect(ITEM_CATEGORY_OPTIONS).toEqual([
      { key: "weapon", label: "Weapons" },
      { key: "armor", label: "Armor" },
      { key: "gear", label: "Gear" },
      { key: "consumable", label: "Consumables" },
    ]);
    expect(ITEM_CATEGORY_OPTIONS.map((o) => o.key)).toEqual(ITEM_CATEGORY_ORDER);
    for (const o of ITEM_CATEGORY_OPTIONS) {
      expect(o.label).toBe(ITEM_CATEGORY_LABELS[o.key]);
    }
  });
});

describe("itemCategoryLabel", () => {
  it("resolves a known category to its plural label", () => {
    expect(itemCategoryLabel("weapon")).toBe("Weapons");
  });

  it("degrades an unknown key to itself", () => {
    expect(itemCategoryLabel("nonexistent")).toBe("nonexistent");
  });
});
