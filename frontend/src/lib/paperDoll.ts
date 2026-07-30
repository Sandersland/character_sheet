/**
 * Paper-doll DISPLAY layer (#566) — pure logic (no JSX) over values the server
 * already resolved: the slot taxonomy and its labels, how the rendered cells
 * group into the desktop rails / mobile tiles, which bag items fit a given slot,
 * and the hands summary. Placement legality, equippability and proficiency are
 * all served per row (`allowedSlots` / `equippable` / `proficient`, #1433) —
 * nothing here re-derives a 5e rule.
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

// The currently-equipped item(s) in a slot, in stable id order. RING may hold
// two; every other slot at most one. Only draws from equippedSlot placement.
export function itemsInSlot(inventory: InventoryItem[], slot: EquipSlot): InventoryItem[] {
  return inventory
    .filter((item) => item.equippedSlot === slot)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Human-readable summary of what's in the hands, for the turn UI's loadout row
// (#733) — e.g. "Longsword & Shield", "Greatsword (two-handed)", "Two daggers"
// (same name in both hands collapses), or "Unarmed" when both hands are empty.
// `offHandLocked` is the served character flag, not re-derived here.
export function equippedLoadoutLabel(inventory: InventoryItem[], offHandLocked: boolean): string {
  const main = itemsInSlot(inventory, "MAIN_HAND")[0];
  const off = itemsInSlot(inventory, "OFF_HAND")[0];
  if (!main && !off) return "Unarmed";
  // A two-handed main-hand weapon owns both hands — no off-hand segment.
  if (main && offHandLocked) return `${main.name} (two-handed)`;
  const names = [main?.name, off?.name].filter((n): n is string => Boolean(n));
  if (names.length === 2 && names[0] === names[1]) return `Two ${names[0].toLowerCase()}s`;
  return names.join(" & ");
}

// Unequipped bag items that legally fit `slot` — the inline picker's candidates.
// Reads the served `allowedSlots` (#1433); slot legality is a backend rule.
export function bagItemsForSlot(inventory: InventoryItem[], slot: EquipSlot): InventoryItem[] {
  return inventory
    .filter((item) => item.equippedSlot == null && item.allowedSlots.includes(slot))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A versatile weapon's current grip, split for the two display surfaces: `short`
// ("1d10"/"1d8") is the compact tile badge that flips as the off-hand fills or
// clears; `full` ("1d10 · two-handed grip") is the Popover detail line. Both read
// the server-derived damage snapshot (deriveWeaponDamage picks the two-handed die
// only when the off-hand is free). Null for non-versatile weapons (nothing flips)
// or items lacking a derived damage snapshot.
export interface VersatileGrip {
  short: string;
  full: string;
}

export function versatileGrip(item: InventoryItem): VersatileGrip | null {
  const weapon = item.weapon;
  if (weapon?.versatileDiceCount == null || weapon.versatileDiceFaces == null) return null;
  const damage = weapon.damage;
  if (!damage) return null;
  const short = `${damage.damageDiceCount}d${damage.damageDiceFaces}`;
  const full = damage.grip === "versatile-two-handed" ? `${short} · two-handed grip` : short;
  return { short, full };
}
