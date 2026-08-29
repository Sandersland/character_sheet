import type { ItemCategory } from "@/types/character";

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

export const ITEM_CATEGORY_OPTIONS: readonly {
  key: ItemCategory;
  label: string;
}[] = ITEM_CATEGORY_ORDER.map((key) => ({ key, label: ITEM_CATEGORY_LABELS[key] }));

export function itemCategoryLabel(key: string): string {
  return ITEM_CATEGORY_LABELS[key as ItemCategory] ?? key;
}
