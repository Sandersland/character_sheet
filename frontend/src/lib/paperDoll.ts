/**
 * Paper-doll placement rules (#566) — the frontend mirror of backend's
 * lib/inventory/inventory.ts allowedSlotsForItem + slot taxonomy. Pure logic (no JSX):
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
// (Named to avoid colliding with lib/inventory/items.ts isEquippable, which is the
// category-level rule; this one is slot-aware and takes the full item.)
export function hasEquipSlots(item: InventoryItem): boolean {
  return allowedSlotsForItem(item).length > 0;
}

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
export function equippedLoadoutLabel(inventory: InventoryItem[]): string {
  const main = itemsInSlot(inventory, "MAIN_HAND")[0];
  const off = itemsInSlot(inventory, "OFF_HAND")[0];
  if (!main && !off) return "Unarmed";
  // A two-handed main-hand weapon owns both hands — no off-hand segment.
  if (main && isOffHandLocked(inventory)) return `${main.name} (two-handed)`;
  const names = [main?.name, off?.name].filter((n): n is string => Boolean(n));
  if (names.length === 2 && names[0] === names[1]) return `Two ${names[0].toLowerCase()}s`;
  return names.join(" & ");
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

// Whether the character is proficient with an equipped item — the frontend
// mirror of backend srd.ts isProficientWithWeapon plus the armor-category rule.
// Weapon grants mix category labels ("Simple Weapons"/"Martial Weapons", matched
// by weaponClass) with pluralised specific names ("Longswords", matched against
// the singular catalog name); armor grants are category-keyed. Items that carry
// no proficiency requirement (gear, consumables, detail-less weapons/armor) are
// always "proficient" so the doll never warns on them. Reads arrays already on
// the wire — no server round-trip.
export function isProficientWithItem(
  item: InventoryItem,
  weaponProficiencies: ReadonlyArray<{ name: string }>,
  armorProficiencies: ReadonlyArray<{ category: string }>,
): boolean {
  if (item.category === "weapon") {
    const weaponClass = item.weapon?.weaponClass;
    // No class (e.g. a homebrew weapon with none set) means no derivable
    // proficiency requirement — never warn, mirroring the armor branch's
    // `!category` guard below.
    if (!weaponClass) return true;
    const lcName = item.name.toLowerCase();
    return weaponProficiencies.some((grant) => {
      if (grant.name === "Simple Weapons" && weaponClass === "simple") return true;
      if (grant.name === "Martial Weapons" && weaponClass === "martial") return true;
      // Specific weapon: grants are plural ("Longswords"), catalog names
      // singular — assumes SRD plurals formed by appending "s" (mirrors backend
      // srd.ts isProficientWithWeapon).
      return grant.name.toLowerCase().replace(/s$/, "") === lcName;
    });
  }
  if (item.category === "armor") {
    const category = item.armor?.armorCategory;
    if (!category) return true;
    return armorProficiencies.some((grant) => grant.category === category);
  }
  return true;
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
