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

// Row action is decided by snapshot shape, not event type: before==null deletes the row, a deletedItem snapshot recreates it, otherwise scalars restore from before; currency reverses first since InsufficientCurrencyError must roll back the whole batch.

// Has no single entityId, so restores each item's pre-rest spent count instead. Handled before the entityId guard in the caller.
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

// currencyDelta is the signed amount applied at write time, so debiting it per-denomination undoes either direction.
async function reverseCurrencyDelta(
  tx: Prisma.TransactionClient,
  characterId: string,
  currencyDelta: Currency | undefined,
) {
  if (!hasNonzeroCurrency(currencyDelta)) return;
  const current = await getCharacterCurrency(tx, characterId);
  await setCharacterCurrency(tx, characterId, currencyDebit(current, currencyDelta));
}

// #1646: `campaignItemId` is the pre-merge name for the same FK, still appearing in older audit blobs; ids were preserved, so it resolves against Item unchanged. Survives only when the referent still exists, else null.
async function resolveSnapshotRefs(
  tx: Prisma.TransactionClient,
  deletedItem: DeletedInventoryItemSnapshot,
): Promise<{ itemId: string | null }> {
  const candidate = deletedItem.itemId ?? deletedItem.campaignItemId ?? null;
  if (!candidate) return { itemId: null };
  const existing = await tx.item.findUnique({ where: { id: candidate }, select: { id: true } });
  return { itemId: existing ? candidate : null };
}

// Reuses the original id so soft-reference entityIds on other events stay valid. #1649: the frozen half is the already-persisted `snapshot` blob, written back verbatim — no per-capability id re-minting, no nested detail-table creates.
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
  // #1648: usesRemaining is a plain InventoryItem column, so restoring it is just another field in this same update.
  if (before.usesRemaining !== undefined) updateData.usesRemaining = before.usesRemaining;
  if (Object.keys(updateData).length > 0) {
    await tx.inventoryItem.update({ where: { id: entityId }, data: updateData });
  }
  // updateMany (not update) so a vanished row is a no-op — capabilityId is historical event-blob field naming; the value it carries is capabilityKey.
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

  // Checked BEFORE the currency reversal so a malformed event carrying a currencyDelta but no entityId can't mutate currency without a corresponding row action.
  if (!event.entityId) return;

  await reverseCurrencyDelta(tx, characterId, data?.currencyDelta ?? undefined);

  if (event.before === null) {
    // Detail rows cascade.
    await tx.inventoryItem.delete({ where: { id: event.entityId } });
    return;
  }

  if (data?.deletedItem) {
    await recreateDeletedItem(tx, characterId, event.entityId, data.deletedItem);
    return;
  }

  await restoreScalars(tx, event.entityId, event.before as Parameters<typeof restoreScalars>[2]);
}
