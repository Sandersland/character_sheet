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

const LOADOUT_GROUP_LABELS: Record<SlotGroup, string> = {
  hands: "Weapons",
  armor: "Armor",
  adornment: "Accessories",
};

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

// The cap is server-supplied (#1377); this only counts and compares, never re-derives the 5e limit.
export function attunementSummary(inventory: InventoryItem[], cap: number): AttunementSummary {
  const count = inventory.filter((item) => item.attuned).length;
  return { count, cap, atCap: count >= cap };
}
