import type { ItemCategory } from "@/types/character";

// Plural display labels for item categories (typed Record — missing key is a compile error).
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: "Weapons",
  armor: "Armor",
  gear: "Gear",
  consumable: "Consumables",
};

// Display/section order — deliberately differs from the ItemCategory type-union order.
export const ITEM_CATEGORY_ORDER: readonly ItemCategory[] = [
  "weapon",
  "armor",
  "gear",
  "consumable",
];

// Ready-made option list derived from ORDER so keys and labels can never drift.
export const ITEM_CATEGORY_OPTIONS: readonly {
  key: ItemCategory;
  label: string;
}[] = ITEM_CATEGORY_ORDER.map((key) => ({ key, label: ITEM_CATEGORY_LABELS[key] }));

// Display label for a category key; tolerant — an unknown key degrades to itself.
export function itemCategoryLabel(key: string): string {
  return ITEM_CATEGORY_LABELS[key as ItemCategory] ?? key;
}
