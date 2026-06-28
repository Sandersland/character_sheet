import type { ItemCategory } from "@/types/character";

// Mirror of backend lib/items.ts. 5e equippability rule: only weapons and
// armor are equippable (the "equipped" flag); consumables and gear are carried,
// never equipped. Keep both copies in sync — there is no schema column for this.
export const EQUIPPABLE_CATEGORIES: ReadonlySet<ItemCategory> = new Set([
  "weapon",
  "armor",
]);

export function isEquippable(category: ItemCategory): boolean {
  return EQUIPPABLE_CATEGORIES.has(category);
}
