import { Prisma, type EquipSlot } from "@/generated/prisma/client.js";
import { normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import { clearBuffByKeyInTx } from "@/lib/combat/buff-end.js";
import { logEvent } from "@/lib/activity/events.js";
import type { ClearOnTrigger } from "@/lib/classes/class-feature-rows.js";
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

// #565: equippedSlot is the single source of truth for "is this equipped" — the wire `equipped` field derives from (equippedSlot != null). Full slots are rejected, not silently displaced.

const RING_SLOT_CAPACITY = 2;

function slotCapacity(slot: EquipSlot): number {
  return slot === "RING" ? RING_SLOT_CAPACITY : 1;
}

function slotLabel(slot: EquipSlot): string {
  return slot.toLowerCase().replace(/_/g, " ");
}

export interface PlaceableItem {
  category: ItemCategory;
  slot: EquipSlot | null;
  weaponDetail: { twoHanded: boolean } | null;
  armorDetail: { armorCategory: ArmorCategory } | null;
}

function isTwoHandedWeapon(item: PlaceableItem): boolean {
  return item.category === "weapon" && Boolean(item.weaponDetail?.twoHanded);
}

// Empty return = not equippable.
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

// Excludes the item being (re)placed so a re-slot never self-collides.
export type EquippedRow = { equippedSlot: EquipSlot | null; weaponDetail: { twoHanded: boolean } | null };

// #1433: exported so serializeCharacter can serve the flag instead of the client re-deriving it. Keys on `weaponDetail?.twoHanded` alone (only weapon rows ever get one) without re-checking category — a schema-level guarantee, not one the type checker enforces on this shape.
export function isOffHandLocked(rows: EquippedRow[]): boolean {
  return rows.some((r) => r.equippedSlot === "MAIN_HAND" && Boolean(r.weaponDetail?.twoHanded));
}

export async function fetchEquippedRows(
  tx: Prisma.TransactionClient,
  characterId: string,
  excludeId: string,
): Promise<EquippedRow[]> {
  // #1649: a Json column can't be sub-selected, so this pulls the whole `snapshot` blob and narrows in TS for a query that only wants one boolean.
  const rows = await tx.inventoryItem.findMany({
    where: { characterId, equippedSlot: { not: null }, id: { not: excludeId } },
    select: { id: true, equippedSlot: true, snapshot: true },
  });
  return rows.map((r) => {
    const weapon = readInventorySnapshot(r).weapon;
    return { equippedSlot: r.equippedSlot, weaponDetail: weapon ? { twoHanded: weapon.twoHanded } : null };
  });
}

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

export function firstFreeSlot(rows: EquippedRow[], item: PlaceableItem): EquipSlot | null {
  for (const slot of allowedSlotsForItem(item)) {
    if (placementError(rows, item, slot) === null) return slot;
  }
  return null;
}

// #1688/#363: body armor raises its own category trigger PLUS "equipBodyArmor" (Mage Armor RAW: "the spell ends if the target dons armor"); a shield raises only "equipShield" since wielding one isn't "donning armor". Light armor raises no medium/heavy/shield trigger, letting a Bladesong-shaped buff survive donning it.
const BODY_ARMOR_TRIGGERS: Record<Exclude<ArmorCategory, "shield">, ClearOnTrigger[]> = {
  light: ["equipBodyArmor", "equipLightArmor"],
  medium: ["equipBodyArmor", "equipMediumArmor"],
  heavy: ["equipBodyArmor", "equipHeavyArmor"],
};

function equipClearTriggers(item: PlaceableItem, slot: EquipSlot): ClearOnTrigger[] {
  if (slot === "BODY" && item.armorDetail && item.armorDetail.armorCategory !== "shield") {
    return BODY_ARMOR_TRIGGERS[item.armorDetail.armorCategory];
  }
  if (slot === "OFF_HAND" && item.armorDetail?.armorCategory === "shield") {
    return ["equipShield"];
  }
  return [];
}

// #1688: equipClearTriggers answers "which triggers does THIS placement raise", not "which buffs die" — that match happens here, per buff.
async function clearBuffsOnEquipInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  slot: EquipSlot,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const triggers = equipClearTriggers(item, slot);
  if (triggers.length === 0) return;
  const row = await tx.character.findUnique({ where: { id: characterId }, select: { activeEffects: true } });
  if (!row) return;
  const { buffs } = normalizeActiveEffectsMutable(row.activeEffects);
  for (const buff of buffs) {
    // buff.clearOn is persisted, untrusted text — compared as a plain string, not asserted as a ClearOnTrigger.
    if ((buff.clearOn ?? []).some((t) => (triggers as readonly string[]).includes(t))) {
      await clearBuffByKeyInTx(tx, characterId, buff.key, batchId, sessionId, `donned ${item.name}`);
    }
  }
}

async function equipIntoSlot(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  slot: EquipSlot,
  batchId: string,
  sessionId: string | null,
) {
  await tx.inventoryItem.update({ where: { id: item.id }, data: { equippedSlot: slot } });
  await clearBuffsOnEquipInTx(tx, characterId, item, slot, batchId, sessionId);
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

// Unequip is always legal so a row can always be cleared.
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
