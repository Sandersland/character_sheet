import type { ItemCategoryName } from "./inventory.js";

// 5e equippability rule: only weapons and armor can be worn/wielded
// (the "equipped" flag). Consumables and gear are carried, never equipped.
// This is the single source of truth for the rule — mirrored on the frontend
// in frontend/src/lib/items.ts. No schema column derives from it.
const EQUIPPABLE_CATEGORIES: ReadonlySet<ItemCategoryName> = new Set([
  "weapon",
  "armor",
]);

export function isEquippable(category: ItemCategoryName): boolean {
  return EQUIPPABLE_CATEGORIES.has(category);
}
