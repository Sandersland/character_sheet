import { Prisma } from "@/generated/prisma/client.js";
import { clearBuffByKeyInTx } from "@/lib/combat/buff-end.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  InvalidInventoryOperationError,
  toJsonInput,
  getCharacterCurrency,
  setCharacterCurrency,
  currencyCredit,
  formatCurrencyForSummary,
  asCurrency,
} from "./inventory-currency.js";
import {
  type AdjustQuantityOperation,
  type UpdateOperation,
  type RemoveOperation,
  type SellOperation,
  type InventoryItemWithDetails,
  getOwnedInventoryItem,
  itemBuffKey,
} from "./inventory-types.js";
import { snapshotInventoryItemForUndo } from "./inventory-snapshot.js";
import { buildInventorySnapshot } from "./inventory-snapshot-build.js";

// Exported so actionsRouter can include an adjustQuantity op inside a shared $transaction without re-opening one.
export async function applyAdjustQuantity(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AdjustQuantityOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  const nextQuantity = item.quantity + op.delta;
  if (nextQuantity < 0) {
    throw new InvalidInventoryOperationError(`Cannot reduce ${item.name} below zero`);
  }

  const adjType = op.delta > 0 ? "acquired" : "consumed";
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: adjType,
    summary: adjType === "acquired"
      ? `Acquired ${item.name} ×${op.delta}`
      : `Consumed ${item.name} ×${Math.abs(op.delta)}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { quantity: item.quantity },
    after: nextQuantity === 0 ? null : { quantity: nextQuantity },
    // Only snapshot for undo when the row is deleted; a partial adjust leaves the row, so `before.quantity` is enough to restore.
    data: {
      itemName: item.name,
      quantityDelta: op.delta,
      ...(nextQuantity === 0 ? { deletedItem: snapshotInventoryItemForUndo(item) } : {}),
    },
    batchId,
    sessionId,
  });

  // fallow-ignore-next-line code-duplication -- zero-quantity delete-and-clear-buff vs update branch intentionally shared across quantity mutations
  if (nextQuantity === 0) {
    // Deleting the row must clear any seeded buff so it can't leak.
    await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `used up ${item.name}`);
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
  }
}

// Correct only because every detail block is flat and zod omits an untouched key entirely rather than sending it as present-with-value-undefined, so the spread can't accidentally wipe a field the caller didn't touch.
function mergedDetail<T extends object>(current: T | null, override: Partial<T> | undefined): T | null {
  return override && current ? { ...current, ...override } : current;
}

// #1649 deleted the per-detail tables, so the merged result is re-validated through buildInventorySnapshot and written back to `snapshot` whole.
function mergedSnapshotSource(item: InventoryItemWithDetails, op: UpdateOperation) {
  return {
    name: op.name ?? item.name,
    category: item.category,
    weight: (op.weight ?? item.weight) ?? null,
    cost: (op.cost ?? asCurrency(item.cost)) ?? null,
    description: (op.description ?? item.description) ?? null,
    slot: item.slot,
    rarity: item.rarity,
    requiresAttunement: item.requiresAttunement,
    attunementPrereqKind: item.attunementPrereqKind,
    attunementPrereqValue: item.attunementPrereqValue,
    weaponDetail: mergedDetail(item.weaponDetail, op.weapon),
    armorDetail: mergedDetail(item.armorDetail, op.armor),
    consumableDetail: mergedDetail(item.consumableDetail, op.consumable),
    // `update` never edits capabilities — round-tripping through readCapability reproduces the same union values unchanged.
    capabilities: item.capabilities,
  };
}

export async function applyUpdate(tx: Prisma.TransactionClient, characterId: string, op: UpdateOperation) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);

  if (op.weapon && !item.weaponDetail) {
    throw new InvalidInventoryOperationError(`${item.name} has no weapon detail to update`);
  }
  if (op.armor && !item.armorDetail) {
    throw new InvalidInventoryOperationError(`${item.name} has no armor detail to update`);
  }
  if (op.consumable && !item.consumableDetail) {
    throw new InvalidInventoryOperationError(`${item.name} has no consumable detail to update`);
  }

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      name: op.name,
      notes: op.notes,
      weight: op.weight,
      cost: op.cost !== undefined ? toJsonInput(op.cost) : undefined,
      description: op.description,
      snapshot: buildInventorySnapshot(mergedSnapshotSource(item, op)) as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function applyRemove(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: RemoveOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "removed",
    summary: `Removed ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { name: item.name, quantity: item.quantity, category: item.category },
    after: null,
    // `remove` always deletes the whole row, so always snapshot for undo.
    data: {
      itemName: item.name,
      quantityDelta: -item.quantity,
      deletedItem: snapshotInventoryItemForUndo(item),
    },
    batchId,
    sessionId,
  });

  // Deleting the row must clear any active-effect buff it seeded (undo re-applies it via the paired effects-event revert, symmetric with the recreated row).
  await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `removed ${item.name}`);
  await tx.inventoryItem.delete({ where: { id: item.id } });
}

export async function applySell(tx: Prisma.TransactionClient, characterId: string, op: SellOperation, batchId: string, sessionId: string | null) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  const quantitySold = op.quantity ?? item.quantity;
  if (quantitySold <= 0 || quantitySold > item.quantity) {
    throw new InvalidInventoryOperationError(`Cannot sell ${quantitySold}x ${item.name} (have ${item.quantity})`);
  }

  const currency = await getCharacterCurrency(tx, characterId);
  await setCharacterCurrency(tx, characterId, currencyCredit(currency, op.currencyDelta));

  const sellCurrencyText = formatCurrencyForSummary(op.currencyDelta);
  const remaining = item.quantity - quantitySold;
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "sold",
    summary: `Sold ${item.name} ×${quantitySold}${sellCurrencyText ? ` (${sellCurrencyText})` : ""}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { quantity: item.quantity },
    after: remaining === 0 ? null : { quantity: remaining },
    // Only snapshot for undo when the FULL stack is sold; a partial sell leaves the row, so `before.quantity` is enough to restore.
    data: {
      itemName: item.name,
      quantityDelta: -quantitySold,
      currencyDelta: op.currencyDelta,
      ...(quantitySold === item.quantity ? { deletedItem: snapshotInventoryItemForUndo(item) } : {}),
    },
    batchId,
    sessionId,
  });

  // fallow-ignore-next-line code-duplication -- full-sell delete-and-clear-buff vs update branch shares the adjust-quantity pattern by design
  if (quantitySold === item.quantity) {
    // Deleting the row must clear any seeded buff so it can't leak.
    await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `sold ${item.name}`);
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: item.quantity - quantitySold } });
  }
}
