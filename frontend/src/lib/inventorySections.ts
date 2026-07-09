import type { Currency, InventoryItem, ItemCategory } from "@/types/character";
import { toCopper } from "@/lib/currency";
import { ITEM_CATEGORY_OPTIONS, ITEM_CATEGORY_ORDER } from "@/lib/items";

export type FilterKey = "all" | "equipped" | ItemCategory;

// Filter chips: All, one per category (labels via ITEM_CATEGORY_OPTIONS), then Equipped.
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  ...ITEM_CATEGORY_OPTIONS,
  { key: "equipped", label: "Equipped" },
];

export interface InventorySection {
  category: ItemCategory;
  items: InventoryItem[];
  weight: number;
}

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };

// Compact weight: drop a trailing ".0" so section headers read "8 lb" not "8.0 lb".
export function formatWeight(weight: number): string {
  return (Math.round(weight * 10) / 10).toString();
}

export function itemsWeight(items: InventoryItem[]): number {
  return items.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0);
}

// Apply the active filter chip + name search; encumbrance still reflects the full pack.
export function filterInventory(
  inventory: InventoryItem[],
  filter: FilterKey,
  search: string
): InventoryItem[] {
  const query = search.trim().toLowerCase();
  return inventory.filter((item) => {
    const matchesFilter =
      filter === "all" ? true : filter === "equipped" ? item.equipped : item.category === filter;
    const matchesSearch = query === "" || item.name.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
}

// Group into the canonical category order, equipped-first then alphabetical; drop empty sections.
export function buildSections(filtered: InventoryItem[]): InventorySection[] {
  return ITEM_CATEGORY_ORDER.map((category) => {
    const items = filtered
      .filter((item) => item.category === category)
      .sort((a, b) =>
        a.equipped !== b.equipped ? (a.equipped ? -1 : 1) : a.name.localeCompare(b.name)
      );
    return { category, items, weight: itemsWeight(items) };
  }).filter((section) => section.items.length > 0);
}

// Rough gp estimate for the selection bar; the sale itself uses exact per-denomination prices.
export function selectionGp(selectedItems: InventoryItem[]): number {
  return Math.round(
    selectedItems.reduce(
      (sum, item) => sum + toCopper(item.cost ?? ZERO_CURRENCY) * item.quantity,
      0
    ) / 100
  );
}
