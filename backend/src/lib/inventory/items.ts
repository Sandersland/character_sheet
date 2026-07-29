import type { ItemCategory } from "./item-detail-inputs.js";

// 5e equippability rule: only weapons and armor can be worn/wielded
// (the "equipped" flag). Consumables and gear are carried, never equipped.
// The sole source of truth — served per inventory row as `equippable` (#1433),
// so the client never re-derives it. No schema column derives from it either.
//
// Deliberately NOT the same rule as `allowedSlotsForItem`: worn gear declaring a
// slot is placeable but not `equippable`, which is what keeps the equip toggle
// off a ring row while the loadout's RING picker still offers it.
const EQUIPPABLE_CATEGORIES: ReadonlySet<ItemCategory> = new Set([
  "weapon",
  "armor",
]);

export function isEquippable(category: ItemCategory): boolean {
  return EQUIPPABLE_CATEGORIES.has(category);
}
