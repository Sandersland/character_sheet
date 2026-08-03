import { randomUUID } from "node:crypto";

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
import { buildInventorySnapshot } from "./inventory-snapshot-build.js";
import type { ArmorDetailFields, ConsumableDetailFields, WeaponDetailFields } from "./detail-snapshot.js";
import { mirrorCapabilityUsedSet } from "./inventory-capability-use.js";

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

// A recreate mints a FRESH id per capability (#1648) rather than reusing the
// deleted row's — deletedItem.capabilities never carried one anyway (a
// delete/undo-delete cycle already recreated capabilities with new ids before
// this issue). The new id keys both the recreated InventoryCapability row and
// its InventoryCapabilityUse mirror, and feeds buildInventorySnapshot's
// capabilities[].key.
function recreateCapabilityCreates(deletedItem: DeletedInventoryItemSnapshot) {
  return (deletedItem.capabilities ?? []).map((c) => ({ ...c, id: randomUUID() }));
}

// The nested detail-block create payload for a recreated row (weapon/armor/
// consumable/capabilities), each present only when the snapshot carried it.
function snapshotDetailNestedCreate(
  deletedItem: DeletedInventoryItemSnapshot,
  capabilityCreates: ReturnType<typeof recreateCapabilityCreates>,
) {
  return {
    weaponDetail: deletedItem.weaponDetail ? { create: deletedItem.weaponDetail } : undefined,
    armorDetail: deletedItem.armorDetail ? { create: deletedItem.armorDetail } : undefined,
    consumableDetail: deletedItem.consumableDetail ? { create: deletedItem.consumableDetail } : undefined,
    capabilities: capabilityCreates.length > 0 ? { create: capabilityCreates } : undefined,
  };
}

// The frozen-half snapshot for a recreated row (#1648) — split out of
// recreateDeletedItem purely to keep that function's cyclomatic complexity
// low (this is where the object literal's ?? defaulting lives).
function recreateSnapshot(
  deletedItem: DeletedInventoryItemSnapshot,
  capabilityCreates: ReturnType<typeof recreateCapabilityCreates>,
): Prisma.InputJsonValue {
  return buildInventorySnapshot({
    name: deletedItem.name,
    category: deletedItem.category,
    weight: deletedItem.weight ?? null,
    cost: deletedItem.cost ?? null,
    description: deletedItem.description ?? null,
    slot: deletedItem.slot,
    rarity: deletedItem.rarity,
    requiresAttunement: deletedItem.requiresAttunement,
    attunementPrereqKind: deletedItem.attunementPrereqKind,
    attunementPrereqValue: deletedItem.attunementPrereqValue,
    // Cast, not a widened SnapshotSourceRow type: deletedItem's fields are
    // typed as Prisma's *CreateWithoutInventoryItemInput (defaulted columns
    // optional), but every real value here came from weaponDetailFields/
    // armorDetailFields/consumableDetailFields on a genuine row
    // (snapshotInventoryItemForUndo), so every field is concretely present.
    weaponDetail: (deletedItem.weaponDetail as WeaponDetailFields | null) ?? null,
    armorDetail: (deletedItem.armorDetail as ArmorDetailFields | null) ?? null,
    consumableDetail: (deletedItem.consumableDetail as ConsumableDetailFields | null) ?? null,
    capabilities: capabilityCreates,
  }) as unknown as Prisma.InputJsonValue;
}

// Recreates a deleted row from its undo snapshot, reusing the original id so
// soft-reference entityIds on other events stay valid.
async function recreateDeletedItem(
  tx: Prisma.TransactionClient,
  characterId: string,
  entityId: string,
  deletedItem: DeletedInventoryItemSnapshot,
) {
  const { itemId } = await resolveSnapshotRefs(tx, deletedItem);
  // Ids generated up front (#1648), same reasoning as awardCampaignItem: one
  // create() call nests capabilities + their capabilityUses mirror, and the
  // snapshot's capabilities[].key matches the id that actually lands.
  const capabilityCreates = recreateCapabilityCreates(deletedItem);
  const capabilityUseCreates = capabilityCreates.map((c) => ({ capabilityKey: c.id, used: c.used ?? 0 }));
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
      notes: deletedItem.notes ?? undefined,
      position: deletedItem.position,
      // Promoted out of InventoryConsumableDetail (#1648) — restored verbatim,
      // same as the nested consumableDetail create below (this is an undo, not
      // a fresh copy, so no freshCopy top-up).
      usesRemaining: deletedItem.consumableDetail?.usesRemaining ?? null,
      snapshot: recreateSnapshot(deletedItem, capabilityCreates),
      capabilityUses: capabilityUseCreates.length > 0 ? { create: capabilityUseCreates } : undefined,
      ...snapshotDetailNestedCreate(deletedItem, capabilityCreates),
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
  // Promoted out of InventoryConsumableDetail (#1648) — restored in the SAME
  // InventoryItem update as the other scalars above, mirroring the value the
  // detail-row restore below writes.
  if (before.usesRemaining !== undefined) updateData.usesRemaining = before.usesRemaining;
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
    await mirrorCapabilityUsedSet(tx, before.capabilityUsed.capabilityId, before.capabilityUsed.used);
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
