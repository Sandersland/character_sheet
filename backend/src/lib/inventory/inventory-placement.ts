import { Prisma, type EquipSlot } from "@/generated/prisma/client.js";
import { clearBuffsByTargetInTx, clearBuffByKeyInTx } from "@/lib/combat/active-effects.js";
import { logEvent } from "@/lib/activity/events.js";
import type { ItemCategory, ArmorCategory } from "./item-detail-inputs.js";
import { InvalidInventoryOperationError } from "./inventory-currency.js";
import {
  type InventoryItemWithDetails,
  type EquipOperation,
  type SetEquippedOperation,
  getOwnedInventoryItem,
  itemBuffKey,
} from "./inventory-types.js";
import { readInventorySnapshot } from "./inventory-snapshot-read.js";

// Paper-doll placement (#565).
//
// equippedSlot is the single source of truth for "is this equipped" — the wire
// `equipped` field derives from (equippedSlot != null). RING holds 2 items;
// every other slot holds 1. A two-handed weapon sits in MAIN_HAND and LOCKS
// OFF_HAND (never a second row). Full slots are rejected, not silently displaced.

const RING_SLOT_CAPACITY = 2;

function slotCapacity(slot: EquipSlot): number {
  return slot === "RING" ? RING_SLOT_CAPACITY : 1;
}

// Human-readable slot name for event summaries / error messages.
function slotLabel(slot: EquipSlot): string {
  return slot.toLowerCase().replace(/_/g, " ");
}

// Minimal shape the placement rules read — a subset of InventoryItemWithDetails.
export interface PlaceableItem {
  category: ItemCategory;
  slot: EquipSlot | null;
  weaponDetail: { twoHanded: boolean } | null;
  armorDetail: { armorCategory: ArmorCategory } | null;
}

function isTwoHandedWeapon(item: PlaceableItem): boolean {
  return item.category === "weapon" && Boolean(item.weaponDetail?.twoHanded);
}

// The slots an item may legally occupy. Weapons/body armor derive from detail
// data; gear declares its slot (null = bag-only). Empty = not equippable.
export function allowedSlotsForItem(item: PlaceableItem): EquipSlot[] {
  if (item.category === "weapon") {
    return isTwoHandedWeapon(item) ? ["MAIN_HAND"] : ["MAIN_HAND", "OFF_HAND"];
  }
  if (item.category === "armor") {
    return item.armorDetail?.armorCategory === "shield" ? ["OFF_HAND"] : ["BODY"];
  }
  if (item.category === "gear") {
    return item.slot ? [item.slot] : [];
  }
  return [];
}

// Other currently-equipped rows, with just the two-handed flag needed for the
// off-hand lock. Excludes the item being (re)placed so a re-slot never self-collides.
export type EquippedRow = { equippedSlot: EquipSlot | null; weaponDetail: { twoHanded: boolean } | null };

// A two-handed weapon in MAIN_HAND owns both hands, so nothing may occupy
// OFF_HAND. Exported (#1433) so `serializeCharacter` can serve the flag instead
// of the client re-deriving it. Keys on `weaponDetail?.twoHanded` alone without
// re-checking `category === "weapon"` — equivalent because only weapon rows ever
// get a weaponDetail row, but that is a schema-level guarantee (see
// InventoryItem's per-category detail relations in schema.prisma), not one the
// type checker enforces on this shape.
export function isOffHandLocked(rows: EquippedRow[]): boolean {
  return rows.some((r) => r.equippedSlot === "MAIN_HAND" && Boolean(r.weaponDetail?.twoHanded));
}

export async function fetchEquippedRows(
  tx: Prisma.TransactionClient,
  characterId: string,
  excludeId: string,
): Promise<EquippedRow[]> {
  // A Json column can't be sub-selected (#1649) — `weaponDetail: { select: {
  // twoHanded } }` becomes selecting the whole `snapshot` and narrowing in TS.
  // Pulls the full blob for a query that only wants one boolean, but the row
  // set here is one character's equipped items, so the extra bytes are cheap.
  const rows = await tx.inventoryItem.findMany({
    where: { characterId, equippedSlot: { not: null }, id: { not: excludeId } },
    select: { id: true, equippedSlot: true, snapshot: true },
  });
  return rows.map((r) => {
    const weapon = readInventorySnapshot(r).weapon;
    return { equippedSlot: r.equippedSlot, weaponDetail: weapon ? { twoHanded: weapon.twoHanded } : null };
  });
}

// Returns a clear error string if `item` may NOT occupy `slot` given the other
// equipped rows, or null when the placement is legal.
function placementError(rows: EquippedRow[], item: PlaceableItem, slot: EquipSlot): string | null {
  const allowed = allowedSlotsForItem(item);
  if (allowed.length === 0) return `${item.category} items cannot be equipped`;
  if (!allowed.includes(slot)) return `This item cannot be equipped in the ${slotLabel(slot)} slot`;

  const offHandOccupied = rows.some((r) => r.equippedSlot === "OFF_HAND");
  if (slot === "OFF_HAND" && isOffHandLocked(rows)) {
    return "The off-hand is locked by a two-handed weapon — unequip it first";
  }
  if (isTwoHandedWeapon(item) && offHandOccupied) {
    return "A two-handed weapon needs a free off-hand — unequip your off-hand first";
  }

  const occupants = rows.filter((r) => r.equippedSlot === slot).length;
  if (occupants >= slotCapacity(slot)) return `The ${slotLabel(slot)} slot is full`;
  return null;
}

// First allowed slot with a legal placement, or null when none is available.
export function firstFreeSlot(rows: EquippedRow[], item: PlaceableItem): EquipSlot | null {
  for (const slot of allowedSlotsForItem(item)) {
    if (placementError(rows, item, slot) === null) return slot;
  }
  return null;
}

// Places an item into a validated slot + logs the undoable `equipped` event.
async function equipIntoSlot(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  slot: EquipSlot,
  batchId: string,
  sessionId: string | null,
) {
  await tx.inventoryItem.update({ where: { id: item.id }, data: { equippedSlot: slot } });
  // Donning body armor true-ends Mage Armor (an "acUnarmoredBase" buff) per RAW —
  // "The spell ends if the target dons armor" — so it must be recast (#363).
  // A shield (OFF_HAND) doesn't count; concentration AC buffs are unaffected.
  if (slot === "BODY") {
    await clearBuffsByTargetInTx(tx, characterId, "acUnarmoredBase", batchId, sessionId, `donned ${item.name}`);
  }
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "equipped",
    summary: `Equipped ${item.name} (${slotLabel(slot)})`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { equippedSlot: item.equippedSlot },
    after: { equippedSlot: slot },
    batchId,
    sessionId,
  });
}

// Equips an item into an explicit slot (#565). Validates slot-compatibility,
// capacity, and the two-handed off-hand lock; rejects a full slot.
export async function applyEquip(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: EquipOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  const rows = await fetchEquippedRows(tx, characterId, item.id);
  const error = placementError(rows, item, op.slot);
  if (error) throw new InvalidInventoryOperationError(error);
  await equipIntoSlot(tx, characterId, item, op.slot, batchId, sessionId);
}

// Unequips (equipped=false) by clearing equippedSlot, or equips (equipped=true)
// by auto-picking the first free compatible slot — the slot-less companion to
// `equip`. Unequip is always legal so a row can always be cleared.
export async function applySetEquipped(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: SetEquippedOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);

  if (op.equipped) {
    if (allowedSlotsForItem(item).length === 0) {
      throw new InvalidInventoryOperationError(`${item.name} (${item.category}) cannot be equipped`);
    }
    const rows = await fetchEquippedRows(tx, characterId, item.id);
    const slot = firstFreeSlot(rows, item);
    if (!slot) {
      throw new InvalidInventoryOperationError(`No free slot available to equip ${item.name}`);
    }
    await equipIntoSlot(tx, characterId, item, slot, batchId, sessionId);
    return;
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { equippedSlot: null } });

  // Unequipping ends any active effect once the item is no longer attuned either.
  if (!item.attuned) {
    await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `unequipped ${item.name}`);
  }

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "unequipped",
    summary: `Unequipped ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { equippedSlot: item.equippedSlot },
    after: { equippedSlot: null },
    batchId,
    sessionId,
  });
}
