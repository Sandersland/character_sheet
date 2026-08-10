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

// Undo / revert.
//
// Reverses one already-applied inventory CharacterEvent inside the caller's
// revert transaction (activityRouter). Shape-driven, NOT type-driven:
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

// Re-links a deleted row's provenance FK on recreate: it survives only when the
// referent still exists (else null — the snapshot is self-contained / SetNull).
// `campaignItemId` is the pre-#1646 name for the same FK and still appears in
// audit blobs written before the merge; ids were preserved, so it resolves
// against Item unchanged.
async function resolveSnapshotRefs(
  tx: Prisma.TransactionClient,
  deletedItem: DeletedInventoryItemSnapshot,
): Promise<{ itemId: string | null }> {
  const candidate = deletedItem.itemId ?? deletedItem.campaignItemId ?? null;
  if (!candidate) return { itemId: null };
  const existing = await tx.item.findUnique({ where: { id: candidate }, select: { id: true } });
  return { itemId: existing ? candidate : null };
}

// Recreates a deleted row from its undo snapshot, reusing the original id so
// soft-reference entityIds on other events stay valid. #1649 simplified this:
// the frozen half is the already-persisted `snapshot` blob, written back
// verbatim — no per-capability id re-minting (a capability's `key` is just an
// opaque string carried inside that blob, not tied to a live row anymore) and
// no nested weapon/armor/consumable/capability creates (those tables are gone).
async function recreateDeletedItem(
  tx: Prisma.TransactionClient,
  characterId: string,
  entityId: string,
  deletedItem: DeletedInventoryItemSnapshot,
) {
  const { itemId } = await resolveSnapshotRefs(tx, deletedItem);
  await tx.inventoryItem.create({
    data: {
      id: entityId,
      characterId,
      itemId,
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
      weaponBonded: deletedItem.weaponBonded,
      notes: deletedItem.notes ?? undefined,
      position: deletedItem.position,
      usesRemaining: deletedItem.usesRemaining,
      snapshot: deletedItem.snapshot,
      capabilityUses: deletedItem.capabilityUses.length > 0 ? { create: deletedItem.capabilityUses } : undefined,
    },
  });
}

// Restores the scalar(s) captured in a surviving row's `before` snapshot:
// quantity (partial sell/adjust), equippedSlot (setEquipped), attuned
// (attune/unattune), weaponBonded (bondWeapon/unbondWeapon, #1854),
// activatedUsesSpent (activate), usesRemaining (charged use), and
// capabilityUsed (a #555 charges-pool spend).
async function restoreScalars(
  tx: Prisma.TransactionClient,
  entityId: string,
  before: {
    quantity?: number;
    equippedSlot?: EquipSlot | null;
    attuned?: boolean;
    weaponBonded?: boolean;
    activatedUsesSpent?: number;
    usesRemaining?: number;
    capabilityUsed?: { capabilityId: string; used: number };
  },
) {
  const updateData: Prisma.InventoryItemUpdateInput = {};
  if (before.quantity !== undefined) updateData.quantity = before.quantity;
  if (before.equippedSlot !== undefined) updateData.equippedSlot = before.equippedSlot;
  if (before.attuned !== undefined) updateData.attuned = before.attuned;
  if (before.weaponBonded !== undefined) updateData.weaponBonded = before.weaponBonded;
  if (before.activatedUsesSpent !== undefined) updateData.activatedUsesSpent = before.activatedUsesSpent;
  // Promoted out of InventoryConsumableDetail (#1648) — a plain InventoryItem
  // column, so restoring it is just another field in this same update.
  if (before.usesRemaining !== undefined) updateData.usesRemaining = before.usesRemaining;
  if (Object.keys(updateData).length > 0) {
    await tx.inventoryItem.update({ where: { id: entityId }, data: updateData });
  }
  // updateMany (not update) so a vanished row is a no-op — capabilityId is
  // event-blob field naming, historical from when it named an InventoryCapability
  // row's id; the value it carries is the same capabilityKey InventoryCapabilityUse
  // is keyed by.
  if (before.capabilityUsed !== undefined) {
    await tx.inventoryCapabilityUse.updateMany({
      where: { capabilityKey: before.capabilityUsed.capabilityId },
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
