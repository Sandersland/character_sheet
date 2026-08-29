import type { ItemCategory } from "./item-detail-inputs.js";

// #1433: the sole source of truth for `equippable`, served per row so the client never re-derives it. Deliberately NOT the same rule as allowedSlotsForItem — worn gear declaring a slot is placeable but not equippable.
const EQUIPPABLE_CATEGORIES: ReadonlySet<ItemCategory> = new Set([
  "weapon",
  "armor",
]);

export function isEquippable(category: ItemCategory): boolean {
  return EQUIPPABLE_CATEGORIES.has(category);
}
