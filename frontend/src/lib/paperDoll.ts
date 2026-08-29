/**
 * Paper-doll DISPLAY layer (#566) — pure logic (no JSX) over values the server
 * already resolved. Placement legality, equippability and proficiency are
 * served per row (`allowedSlots` / `equippable` / `proficient`, #1433) —
 * nothing here re-derives a 5e rule.
 */
import type { EquipSlot, InventoryItem } from "@/types/character";

/** Matches backend capacity: RING holds two, every other slot holds one. */
export const RING_CAPACITY = 2;

export function equipSlotLabel(slot: EquipSlot): string {
  const words = slot.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const WORN_SLOT_ITEM_KIND_LABELS = {
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

/** MAIN_HAND/OFF_HAND/BODY are derived from weapon/armor detail, never authored — excluded here. */
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

export function wornSlotItemKindLabel(slot: WornSlot): string {
  return WORN_SLOT_ITEM_KIND_LABELS[slot];
}

export type SlotGroup = "hands" | "armor" | "adornment";

export const SLOT_GROUPS: Record<SlotGroup, { label: string; slots: EquipSlot[] }> = {
  hands: { label: "Hands", slots: ["MAIN_HAND", "OFF_HAND"] },
  armor: { label: "Armor", slots: ["HEAD", "BODY", "HANDS", "FEET"] },
  adornment: { label: "Adornment", slots: ["NECK", "CLOAK", "WRISTS", "BELT", "RING"] },
};

export const SLOT_GROUP_ORDER: readonly SlotGroup[] = ["hands", "armor", "adornment"];

export function itemsInSlot(inventory: InventoryItem[], slot: EquipSlot): InventoryItem[] {
  return inventory
    .filter((item) => item.equippedSlot === slot)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** `offHandLocked` is the served character flag, not re-derived here. */
export function equippedLoadoutLabel(inventory: InventoryItem[], offHandLocked: boolean): string {
  const main = itemsInSlot(inventory, "MAIN_HAND")[0];
  const off = itemsInSlot(inventory, "OFF_HAND")[0];
  if (!main && !off) return "Unarmed";
  if (main && offHandLocked) return `${main.name} (two-handed)`;
  const names = [main?.name, off?.name].filter((n): n is string => Boolean(n));
  if (names.length === 2 && names[0] === names[1]) return `Two ${names[0].toLowerCase()}s`;
  return names.join(" & ");
}

/** Reads the served `allowedSlots` (#1433); slot legality is a backend rule. */
export function bagItemsForSlot(inventory: InventoryItem[], slot: EquipSlot): InventoryItem[] {
  return inventory
    .filter((item) => item.equippedSlot == null && item.allowedSlots.includes(slot))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface VersatileGrip {
  short: string;
  full: string;
}

/** Reads the server-derived damage snapshot — deriveWeaponDamage (backend) picks the two-handed die only when the off-hand is free. */
export function versatileGrip(item: InventoryItem): VersatileGrip | null {
  const weapon = item.weapon;
  if (weapon?.versatileDiceCount == null || weapon.versatileDiceFaces == null) return null;
  const damage = weapon.damage;
  if (!damage) return null;
  const short = `${damage.damageDiceCount}d${damage.damageDiceFaces}`;
  const full = damage.grip === "versatile-two-handed" ? `${short} · two-handed grip` : short;
  return { short, full };
}
