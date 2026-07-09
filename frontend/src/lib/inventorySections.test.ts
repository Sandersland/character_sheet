import { describe, it, expect } from "vitest";

import type { InventoryItem } from "@/types/character";
import {
  FILTERS,
  buildSections,
  filterInventory,
  formatWeight,
  itemsWeight,
  selectionGp,
} from "@/lib/inventorySections";

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    name: "Plate Armor",
    category: "armor",
    quantity: 1,
    weight: 65,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    ...overrides,
  } as InventoryItem;
}

describe("FILTERS", () => {
  it("leads with All, ends with Equipped, and lists every category between", () => {
    expect(FILTERS[0]).toEqual({ key: "all", label: "All" });
    expect(FILTERS[FILTERS.length - 1]).toEqual({ key: "equipped", label: "Equipped" });
    const middle = FILTERS.slice(1, -1).map((f) => f.key);
    expect(middle).toEqual(["weapon", "armor", "gear", "consumable"]);
  });
});

describe("formatWeight", () => {
  it("drops a trailing .0", () => {
    expect(formatWeight(8)).toBe("8");
  });
  it("keeps a fractional tenth", () => {
    expect(formatWeight(8.5)).toBe("8.5");
  });
  it("rounds to a single decimal", () => {
    expect(formatWeight(8.04)).toBe("8");
    expect(formatWeight(8.06)).toBe("8.1");
  });
});

describe("itemsWeight", () => {
  it("returns 0 for an empty pack", () => {
    expect(itemsWeight([])).toBe(0);
  });
  it("multiplies weight by quantity and sums", () => {
    const items = [makeItem({ weight: 3, quantity: 2 }), makeItem({ id: "b", weight: 1, quantity: 5 })];
    expect(itemsWeight(items)).toBe(11);
  });
  it("treats a missing weight as 0", () => {
    expect(itemsWeight([makeItem({ weight: undefined, quantity: 4 })])).toBe(0);
  });
});

describe("filterInventory", () => {
  const inventory = [
    makeItem({ id: "w1", name: "Longsword", category: "weapon", equipped: true }),
    makeItem({ id: "w2", name: "Dagger", category: "weapon" }),
    makeItem({ id: "a1", name: "Shield", category: "armor" }),
    makeItem({ id: "g1", name: "Torch", category: "gear" }),
  ];

  it("all + empty search returns everything", () => {
    expect(filterInventory(inventory, "all", "")).toHaveLength(4);
  });
  it("filters by category", () => {
    expect(filterInventory(inventory, "weapon", "").map((i) => i.id)).toEqual(["w1", "w2"]);
  });
  it("filters to equipped only", () => {
    expect(filterInventory(inventory, "equipped", "").map((i) => i.id)).toEqual(["w1"]);
  });
  it("searches case-insensitively on a name substring", () => {
    expect(filterInventory(inventory, "all", "SWORD").map((i) => i.id)).toEqual(["w1"]);
  });
  it("trims surrounding whitespace before matching", () => {
    expect(filterInventory(inventory, "all", "  dagger  ").map((i) => i.id)).toEqual(["w2"]);
  });
  it("composes filter AND search", () => {
    expect(filterInventory(inventory, "weapon", "dag").map((i) => i.id)).toEqual(["w2"]);
  });
  it("returns empty when nothing matches", () => {
    expect(filterInventory(inventory, "all", "zzz")).toEqual([]);
  });
});

describe("buildSections", () => {
  it("returns no sections for an empty list", () => {
    expect(buildSections([])).toEqual([]);
  });
  it("orders sections Weapons → Armor → Gear → Consumables and drops empties", () => {
    const filtered = [
      makeItem({ id: "c1", category: "consumable" }),
      makeItem({ id: "w1", category: "weapon" }),
      makeItem({ id: "a1", category: "armor" }),
    ];
    expect(buildSections(filtered).map((s) => s.category)).toEqual(["weapon", "armor", "consumable"]);
  });
  it("sorts equipped first, then alphabetical, within a section", () => {
    const filtered = [
      makeItem({ id: "w1", name: "Club", category: "weapon", equipped: false }),
      makeItem({ id: "w2", name: "Axe", category: "weapon", equipped: false }),
      makeItem({ id: "w3", name: "Longsword", category: "weapon", equipped: true }),
    ];
    expect(buildSections(filtered)[0].items.map((i) => i.name)).toEqual(["Longsword", "Axe", "Club"]);
  });
  it("sums per-section weight by quantity", () => {
    const filtered = [makeItem({ id: "g1", category: "gear", weight: 1, quantity: 2 })];
    expect(buildSections(filtered)[0].weight).toBe(2);
  });
});

describe("selectionGp", () => {
  it("is 0 for no selection", () => {
    expect(selectionGp([])).toBe(0);
  });
  it("treats a missing cost as 0 gp", () => {
    expect(selectionGp([makeItem({ cost: undefined })])).toBe(0);
  });
  it("sums cost × quantity and rounds to whole gp", () => {
    const items = [
      makeItem({ id: "w1", cost: { cp: 0, sp: 0, gp: 10, pp: 0 }, quantity: 2 }),
      makeItem({ id: "a1", cost: { cp: 0, sp: 0, gp: 5, pp: 0 }, quantity: 1 }),
    ];
    expect(selectionGp(items)).toBe(25);
  });
});
