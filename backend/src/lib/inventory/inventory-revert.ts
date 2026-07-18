import { Prisma, type EquipSlot } from "@/generated/prisma/client.js";
import {
  type Currency,
  hasNonzeroCurrency,
  getCharacterCurrency,
  setCharacterCurrency,
  currencyDebit,
  toJsonInput,
} from "./inventory-currency.js";
import type { DeletedInventoryItemSnapshot } from "./inventory-snapshot.js";

// ── Undo / revert ────────────────────────────────────────────────────────────
//
// Reverses one already-applied inventory CharacterEvent inside the caller's
// revert transaction (routes/activity.ts). Shape-driven, NOT type-driven:
// event `type` names (acquired/consumed/sold/…) are shared across ops, so the
// row action is decided by the snapshot shape instead:
//
//   before == null            → the op CREATED the row (acquire) → delete it
//   data.deletedItem present  → the op DELETED the row → recreate from snapshot
//   else                      → the row still exists → restore scalar(s) from before
//
// Currency is reversed first: data.currencyDelta is the signed amount applied
// at write time (negative for a purchase, positive for a sale), so subtracting
// it per-denomination undoes either direction. A negative result (the player
// has since spent the proceeds) throws InsufficientCurrencyError, which rolls
// back the whole revert batch.
// Undo of a rest-recharge event: it has no single entityId, so restore each
// item's pre-rest spent count. Handled before the entityId guard in the caller.
async function revertRecharge(
  tx: Prisma.TransactionClient,
  recharged: { id: string; previousSpent: number }[],
) {
  for (const r of recharged) {
    await tx.inventoryItem.updateMany({
      where: { id: r.id },
      data: { activatedUsesSpent: r.previousSpent },
    });
  }
}

// Reverses a purchase/sale currency movement — currencyDelta is the signed
// amount applied at write time, so debiting it per-denomination undoes either way.
async function reverseCurrencyDelta(
  tx: Prisma.TransactionClient,
  characterId: string,
  currencyDelta: Currency | undefined,
) {
  if (!hasNonzeroCurrency(currencyDelta)) return;
  const current = await getCharacterCurrency(tx, characterId);
  await setCharacterCurrency(tx, characterId, currencyDebit(current, currencyDelta));
}

// Re-links a deleted row's provenance FKs on recreate: itemId (catalog) and
// campaignItemId (#381) survive only when their referent still exists (else
// null — the snapshot is self-contained / SetNull).
async function resolveSnapshotRefs(
  tx: Prisma.TransactionClient,
  deletedItem: DeletedInventoryItemSnapshot,
): Promise<{ itemId: string | null; campaignItemId: string | null }> {
  let itemId = deletedItem.itemId;
  if (itemId) {
    const catalogItem = await tx.item.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!catalogItem) itemId = null;
  }
  let campaignItemId = deletedItem.campaignItemId ?? null;
  if (campaignItemId) {
    const campaignItem = await tx.campaignItem.findUnique({ where: { id: campaignItemId }, select: { id: true } });
    if (!campaignItem) campaignItemId = null;
  }
  return { itemId, campaignItemId };
}

// The nested detail-block create payload for a recreated row (weapon/armor/
// consumable/capabilities), each present only when the snapshot carried it.
function snapshotDetailNestedCreate(deletedItem: DeletedInventoryItemSnapshot) {
  return {
    weaponDetail: deletedItem.weaponDetail ? { create: deletedItem.weaponDetail } : undefined,
    armorDetail: deletedItem.armorDetail ? { create: deletedItem.armorDetail } : undefined,
    consumableDetail: deletedItem.consumableDetail ? { create: deletedItem.consumableDetail } : undefined,
    capabilities:
      deletedItem.capabilities && deletedItem.capabilities.length > 0
        ? { create: deletedItem.capabilities }
        : undefined,
  };
}

// Recreates a deleted row from its undo snapshot, reusing the original id so
// soft-reference entityIds on other events stay valid.
async function recreateDeletedItem(
  tx: Prisma.TransactionClient,
  characterId: string,
  entityId: string,
  deletedItem: DeletedInventoryItemSnapshot,
) {
  const { itemId, campaignItemId } = await resolveSnapshotRefs(tx, deletedItem);
  await tx.inventoryItem.create({
    data: {
      id: entityId,
      characterId,
      itemId,
      campaignItemId,
      name: deletedItem.name,
      category: deletedItem.category,
      weight: deletedItem.weight ?? undefined,
      cost: toJsonInput(deletedItem.cost),
      description: deletedItem.description ?? undefined,
      quantity: deletedItem.quantity,
      equippedSlot: deletedItem.equippedSlot,
      slot: deletedItem.slot,
      rarity: deletedItem.rarity,
      attuned: deletedItem.attuned,
      requiresAttunement: deletedItem.requiresAttunement,
      attunementPrereqKind: deletedItem.attunementPrereqKind,
      attunementPrereqValue: deletedItem.attunementPrereqValue,
      notes: deletedItem.notes ?? undefined,
      position: deletedItem.position,
      ...snapshotDetailNestedCreate(deletedItem),
    },
  });
}

// Restores the scalar(s) captured in a surviving row's `before` snapshot:
// quantity (partial sell/adjust), equippedSlot (setEquipped), attuned
// (attune/unattune), activatedUsesSpent (activate), usesRemaining (charged use),
// and capabilityUsed (a #555 charges-pool spend).
async function restoreScalars(
  tx: Prisma.TransactionClient,
  entityId: string,
  before: {
    quantity?: number;
    equippedSlot?: EquipSlot | null;
    attuned?: boolean;
    activatedUsesSpent?: number;
    usesRemaining?: number;
    capabilityUsed?: { capabilityId: string; used: number };
  },
) {
  const updateData: Prisma.InventoryItemUpdateInput = {};
  if (before.quantity !== undefined) updateData.quantity = before.quantity;
  if (before.equippedSlot !== undefined) updateData.equippedSlot = before.equippedSlot;
  if (before.attuned !== undefined) updateData.attuned = before.attuned;
  if (before.activatedUsesSpent !== undefined) updateData.activatedUsesSpent = before.activatedUsesSpent;
  if (Object.keys(updateData).length > 0) {
    await tx.inventoryItem.update({ where: { id: entityId }, data: updateData });
  }
  // usesRemaining lives on the detail row, so restore it separately.
  if (before.usesRemaining !== undefined) {
    await tx.inventoryConsumableDetail.update({
      where: { inventoryItemId: entityId },
      data: { usesRemaining: before.usesRemaining },
    });
  }
  // updateMany (not update) so a vanished row is a no-op — a delete/undo-delete
  // cycle recreates capabilities with NEW ids, so the old id may be gone.
  if (before.capabilityUsed !== undefined) {
    await tx.inventoryCapability.updateMany({
      where: { id: before.capabilityUsed.capabilityId },
      data: { used: before.capabilityUsed.used },
    });
  }
}

export async function revertInventoryEvent(
  tx: Prisma.TransactionClient,
  characterId: string,
  event: {
    entityId: string | null;
    before: Prisma.JsonValue | null;
    data: Prisma.JsonValue | null;
  }
): Promise<void> {
  const data = event.data as
    | {
        currencyDelta?: Currency | null;
        deletedItem?: DeletedInventoryItemSnapshot;
        recharged?: { id: string; previousSpent: number }[];
      }
    | null;

  if (data?.recharged) {
    await revertRecharge(tx, data.recharged);
    return;
  }

  // Defensive: nothing to act on without a row id. Checked BEFORE the currency
  // reversal so a malformed event carrying a currencyDelta but no entityId can't
  // mutate currency without a corresponding row action. Well-formed events
  // always have an entityId, so this is a pure no-op for them.
  if (!event.entityId) return;

  // 1. Reverse any currency movement (purchase or sale proceeds).
  await reverseCurrencyDelta(tx, characterId, data?.currencyDelta ?? undefined);

  // 2. Reverse the row mutation, shape-driven.
  if (event.before === null) {
    // Creation (acquire) → delete the created row; detail rows cascade.
    await tx.inventoryItem.delete({ where: { id: event.entityId } });
    return;
  }

  if (data?.deletedItem) {
    await recreateDeletedItem(tx, characterId, event.entityId, data.deletedItem);
    return;
  }

  await restoreScalars(tx, event.entityId, event.before as Parameters<typeof restoreScalars>[2]);
}
