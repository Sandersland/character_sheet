/**
 * Loadout-list model (#925) — the grouped-rows replacement for the rejected
 * tile-grid paper doll. Pure logic (no JSX): walks `SLOT_GROUPS` into ordered
 * Weapons / Armor / Accessories groups of filled, empty, or locked rows. Every
 * rule it reports (`notProficient`, the off-hand lock) is a served flag, not a
 * local derivation; the server owns placement validation too.
 */
import type { Character, EquipSlot, InventoryItem } from "@/types/character";
import {
  equipSlotLabel,
  itemsInSlot,
  RING_CAPACITY,
  SLOT_GROUP_ORDER,
  SLOT_GROUPS,
  versatileGrip,
  type SlotGroup,
  type VersatileGrip,
} from "@/lib/paperDoll";

// Loadout section headings — the grouped-list rename of the doll's slot groups.
const LOADOUT_GROUP_LABELS: Record<SlotGroup, string> = {
  hands: "Weapons",
  armor: "Armor",
  adornment: "Accessories",
};

// 5e caps attunement at three items; the count is derived, never stored.
const ATTUNEMENT_CAP = 3;

export interface FilledLoadoutRow {
  kind: "filled";
  key: string;
  slot: EquipSlot;
  label: string;
  item: InventoryItem;
  notProficient: boolean;
  grip: VersatileGrip | null;
}

export interface EmptyLoadoutRow {
  kind: "empty";
  key: string;
  slot: EquipSlot;
  label: string;
}

export interface LockedLoadoutRow {
  kind: "locked";
  key: string;
  slot: EquipSlot;
  label: string;
  lockedByName: string;
}

export type LoadoutRow = FilledLoadoutRow | EmptyLoadoutRow | LockedLoadoutRow;

export interface LoadoutGroup {
  key: SlotGroup;
  label: string;
  rows: LoadoutRow[];
}

function filledRow(slot: EquipSlot, key: string, label: string, item: InventoryItem): FilledLoadoutRow {
  const grip = slot === "MAIN_HAND" ? versatileGrip(item) : null;
  return { kind: "filled", key, slot, label, item, notProficient: !item.proficient, grip };
}

// The rows a single slot contributes: RING expands to RING_CAPACITY numbered
// rows; a two-handed main-hand locks the off-hand into a static held-by row.
function rowsForSlot(
  inventory: InventoryItem[],
  slot: EquipSlot,
  offHandLocked: boolean,
  mainHandItem: InventoryItem | null,
): LoadoutRow[] {
  const baseLabel = equipSlotLabel(slot);
  if (slot === "RING") {
    const rings = itemsInSlot(inventory, "RING");
    return Array.from({ length: RING_CAPACITY }, (_, i) => {
      const key = `RING-${i}`;
      const label = `${baseLabel} ${i + 1}`;
      const item = rings[i] ?? null;
      return item
        ? filledRow(slot, key, label, item)
        : ({ kind: "empty", key, slot, label } satisfies EmptyLoadoutRow);
    });
  }
  if (slot === "OFF_HAND" && offHandLocked) {
    return [{ kind: "locked", key: slot, slot, label: baseLabel, lockedByName: mainHandItem?.name ?? "" }];
  }
  const item = itemsInSlot(inventory, slot)[0] ?? null;
  return [
    item
      ? filledRow(slot, slot, baseLabel, item)
      : ({ kind: "empty", key: slot, slot, label: baseLabel } satisfies EmptyLoadoutRow),
  ];
}

// The full loadout, grouped Weapons / Armor / Accessories in slot-taxonomy order.
export function buildLoadoutGroups(character: Character): LoadoutGroup[] {
  const inventory = character.inventory;
  const offHandLocked = character.offHandLocked;
  const mainHandItem = offHandLocked ? (itemsInSlot(inventory, "MAIN_HAND")[0] ?? null) : null;
  return SLOT_GROUP_ORDER.map((group) => ({
    key: group,
    label: LOADOUT_GROUP_LABELS[group],
    rows: SLOT_GROUPS[group].slots.flatMap((slot) =>
      rowsForSlot(inventory, slot, offHandLocked, mainHandItem),
    ),
  }));
}

export interface AttunementSummary {
  count: number;
  cap: number;
  atCap: boolean;
}

// Derived attunement counter for the loadout header — count vs the 5e cap.
export function attunementSummary(inventory: InventoryItem[]): AttunementSummary {
  const count = inventory.filter((item) => item.attuned).length;
  return { count, cap: ATTUNEMENT_CAP, atCap: count >= ATTUNEMENT_CAP };
}
