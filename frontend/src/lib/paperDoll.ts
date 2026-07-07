/**
 * Paper-doll placement rules (#566) — the frontend mirror of backend's
 * lib/inventory.ts allowedSlotsForItem + slot taxonomy. Pure logic (no JSX):
 * which slots an item may occupy, how the twelve rendered cells group into the
 * desktop rails / mobile tiles, and which bag items fit a given slot. The server
 * is the source of truth for placement validation; this only drives the UI.
 */
import type { EquipSlot, InventoryItem } from "@/types/character";

// RING holds two items; every other slot holds one (matches backend capacity).
export const RING_CAPACITY = 2;

// Human-readable slot name for headings / aria labels, e.g. "Main hand".
export function equipSlotLabel(slot: EquipSlot): string {
  const words = slot.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Item-kind label per worn slot — names the thing you wear ("Gloves" for HANDS),
// not the body location. Single source for the DM gear slot-authoring picker.
export const WORN_SLOT_ITEM_KIND_LABELS = {
  HEAD: "Headwear",
  NECK: "Amulet / Necklace",
  CLOAK: "Cloak",
  HANDS: "Gloves",
  WRISTS: "Bracers",
  BELT: "Belt",
  FEET: "Boots",
  RING: "Ring",
} as const satisfies Record<string, string>;

export type WornSlot = keyof typeof WORN_SLOT_ITEM_KIND_LABELS;

// The eight worn slots gear may declare. MAIN_HAND/OFF_HAND/BODY are derived from
// weapon/armor detail, never authored, so they're excluded from this list.
export const WORN_SLOTS: readonly WornSlot[] = [
  "HEAD",
  "NECK",
  "CLOAK",
  "HANDS",
  "WRISTS",
  "BELT",
  "FEET",
  "RING",
];

// The item-kind name for a worn slot, for the gear slot picker.
export function wornSlotItemKindLabel(slot: WornSlot): string {
  return WORN_SLOT_ITEM_KIND_LABELS[slot];
}

// The three mobile tile groups; also the desktop rail assignment. Hands sits
// bottom-center on the doll, Armor is the left rail, Adornment the right rail.
export type SlotGroup = "hands" | "armor" | "adornment";

export const SLOT_GROUPS: Record<SlotGroup, { label: string; slots: EquipSlot[] }> = {
  hands: { label: "Hands", slots: ["MAIN_HAND", "OFF_HAND"] },
  armor: { label: "Armor", slots: ["HEAD", "BODY", "HANDS", "FEET"] },
  adornment: { label: "Adornment", slots: ["NECK", "CLOAK", "WRISTS", "BELT", "RING"] },
};

export const SLOT_GROUP_ORDER: readonly SlotGroup[] = ["hands", "armor", "adornment"];

// The slots an item may legally occupy — mirror of backend allowedSlotsForItem.
// Weapons/body armor derive from detail data; gear declares its slot. Empty =
// not equippable (bag-only: consumables, slotless gear).
export function allowedSlotsForItem(item: InventoryItem): EquipSlot[] {
  if (item.category === "weapon") {
    return item.weapon?.twoHanded ? ["MAIN_HAND"] : ["MAIN_HAND", "OFF_HAND"];
  }
  if (item.category === "armor") {
    return item.armor?.armorCategory === "shield" ? ["OFF_HAND"] : ["BODY"];
  }
  if (item.category === "gear") {
    return item.slot ? [item.slot] : [];
  }
  return [];
}

// Any item the paper doll can place — i.e. it has at least one legal slot.
export function isEquippable(item: InventoryItem): boolean {
  return allowedSlotsForItem(item).length > 0;
}

// The currently-equipped item(s) in a slot, in stable id order. RING may hold
// two; every other slot at most one. Only draws from equippedSlot placement.
export function itemsInSlot(inventory: InventoryItem[], slot: EquipSlot): InventoryItem[] {
  return inventory
    .filter((item) => item.equippedSlot === slot)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// A two-handed weapon in MAIN_HAND locks the OFF_HAND (no shield/second weapon).
export function isOffHandLocked(inventory: InventoryItem[]): boolean {
  return inventory.some(
    (item) => item.equippedSlot === "MAIN_HAND" && item.category === "weapon" && item.weapon?.twoHanded,
  );
}

// Unequipped bag items that legally fit `slot` — the inline picker's candidates.
export function bagItemsForSlot(inventory: InventoryItem[], slot: EquipSlot): InventoryItem[] {
  return inventory
    .filter((item) => item.equippedSlot == null && allowedSlotsForItem(item).includes(slot))
    .sort((a, b) => a.name.localeCompare(b.name));
}
