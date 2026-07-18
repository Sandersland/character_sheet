import { Prisma, type EquipSlot } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import type { ItemCategoryName } from "./item-detail-inputs.js";
import {
  type Currency,
  InvalidInventoryOperationError,
  asCurrency,
  toJsonInput,
  currencyDebit,
  getCharacterCurrency,
  setCharacterCurrency,
  hasNonzeroCurrency,
  negate,
  formatCurrencyForSummary,
} from "./inventory-currency.js";
import {
  type AcquireOperation,
  type CustomItemInput,
  catalogItemDetailInclude,
  nextPosition,
} from "./inventory-types.js";
import {
  type PlaceableItem,
  fetchEquippedRows,
  firstFreeSlot,
} from "./inventory-placement.js";
import {
  snapshotItemDetail,
  normalizeWeaponDetail,
  normalizeArmorDetail,
  normalizeConsumableDetail,
} from "./inventory-snapshot.js";

// The resolved item facts an acquire creates its row from — catalog snapshot
// or homebrew custom, unified so applyAcquire's create is source-agnostic.
interface AcquireSource {
  itemId: string | null;
  name: string;
  category: ItemCategoryName;
  weight: number | undefined;
  cost: Currency | undefined;
  description: string | undefined;
  slot: EquipSlot | null;
  detail: ReturnType<typeof snapshotItemDetail>;
}

// Snapshots a catalog Item into acquire item-facts; throws on an unknown id.
async function catalogAcquireSource(
  tx: Prisma.TransactionClient,
  itemId: string,
): Promise<AcquireSource> {
  const catalogItem = await tx.item.findUnique({
    where: { id: itemId },
    include: catalogItemDetailInclude,
  });
  if (!catalogItem) {
    throw new InvalidInventoryOperationError(`Unknown catalog item: ${itemId}`);
  }
  return {
    itemId: catalogItem.id,
    name: catalogItem.name,
    category: catalogItem.category,
    weight: catalogItem.weight ?? undefined,
    cost: asCurrency(catalogItem.cost) ?? undefined,
    description: catalogItem.description ?? undefined,
    slot: catalogItem.slot,
    detail: snapshotItemDetail(catalogItem),
  };
}

// Homebrew acquire item-facts, with the weapon/armor/consumable nested-create.
function customAcquireSource(custom: CustomItemInput): AcquireSource {
  return {
    itemId: null,
    name: custom.name,
    category: custom.category,
    weight: custom.weight,
    cost: custom.cost,
    description: custom.description,
    slot: custom.slot ?? null,
    detail: {
      weaponDetail: custom.weapon ? { create: normalizeWeaponDetail(custom.weapon) } : undefined,
      armorDetail: custom.armor ? { create: normalizeArmorDetail(custom.armor) } : undefined,
      consumableDetail: custom.consumable ? { create: normalizeConsumableDetail(custom.consumable) } : undefined,
    },
  };
}

// Resolves an acquire op to its item facts: catalog snapshot (itemId) or
// homebrew (custom) — exactly one; throws when neither is supplied.
async function resolveAcquireSource(
  tx: Prisma.TransactionClient,
  op: AcquireOperation,
): Promise<AcquireSource> {
  if (op.itemId) return catalogAcquireSource(tx, op.itemId);
  if (op.custom) return customAcquireSource(op.custom);
  throw new InvalidInventoryOperationError("acquire requires either itemId or custom");
}

// "Add & equip": auto-place a freshly-created row into the first free compatible
// slot (#565). Silent — a fresh acquire that can't be slotted stays in the bag.
async function autoEquipAcquired(
  tx: Prisma.TransactionClient,
  characterId: string,
  createdId: string,
  source: AcquireSource,
) {
  const placeable: PlaceableItem = {
    category: source.category,
    slot: source.slot,
    weaponDetail: source.detail.weaponDetail
      ? { twoHanded: Boolean(source.detail.weaponDetail.create.twoHanded) }
      : null,
    armorDetail: source.detail.armorDetail
      ? { armorCategory: source.detail.armorDetail.create.armorCategory }
      : null,
  };
  const rows = await fetchEquippedRows(tx, characterId, createdId);
  const autoSlot = firstFreeSlot(rows, placeable);
  if (autoSlot) {
    await tx.inventoryItem.update({ where: { id: createdId }, data: { equippedSlot: autoSlot } });
  }
}

// Applies the acquire's currency debit (the "Buy" path) and returns the signed
// delta stored on the event (negated debit), or null for a plain "Add".
async function applyAcquireCurrency(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AcquireOperation,
): Promise<Currency | null> {
  const currencyDelta = hasNonzeroCurrency(op.currencyDelta) ? op.currencyDelta : null;
  if (!currencyDelta) return null;
  const currency = await getCharacterCurrency(tx, characterId);
  await setCharacterCurrency(tx, characterId, currencyDebit(currency, currencyDelta));
  return negate(currencyDelta);
}

export async function applyAcquire(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AcquireOperation,
  batchId: string,
  sessionId: string | null,
) {
  const quantity = op.quantity ?? 1;
  const position = await nextPosition(tx, characterId);
  const source = await resolveAcquireSource(tx, op);

  const created = await tx.inventoryItem.create({
    data: {
      characterId,
      itemId: source.itemId,
      name: source.name,
      category: source.category,
      weight: source.weight,
      cost: toJsonInput(source.cost),
      description: source.description,
      quantity,
      equippedSlot: null,
      slot: source.slot,
      notes: op.notes,
      position,
      ...source.detail,
    },
  });

  if (op.equipped) {
    await autoEquipAcquired(tx, characterId, created.id, source);
  }

  const storedDelta = await applyAcquireCurrency(tx, characterId, op);
  const eventType = storedDelta ? "bought" : "acquired";
  const currencyText = formatCurrencyForSummary(storedDelta);
  const summary = eventType === "bought"
    ? `Bought ${created.name} ×${quantity}${currencyText ? ` (${currencyText})` : ""}`
    : `Acquired ${created.name} ×${quantity}`;
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: eventType,
    summary,
    entityType: "InventoryItem",
    entityId: created.id,
    before: null,
    after: { id: created.id, name: created.name, quantity, category: created.category },
    data: { itemName: created.name, quantityDelta: quantity, currencyDelta: storedDelta },
    batchId,
    sessionId,
  });
}
