import { Prisma, type EquipSlot } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import type { ItemCategory } from "./item-detail-inputs.js";
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
import { buildInventorySnapshot } from "./inventory-snapshot-build.js";

interface AcquireSource {
  itemId: string | null;
  name: string;
  category: ItemCategory;
  weight: number | undefined;
  cost: Currency | undefined;
  description: string | undefined;
  slot: EquipSlot | null;
  detail: ReturnType<typeof snapshotItemDetail>;
}

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

async function resolveAcquireSource(
  tx: Prisma.TransactionClient,
  op: AcquireOperation,
): Promise<AcquireSource> {
  if (op.itemId) return catalogAcquireSource(tx, op.itemId);
  if (op.custom) return customAcquireSource(op.custom);
  throw new InvalidInventoryOperationError("acquire requires either itemId or custom");
}

// #565: silent — a fresh acquire that can't be slotted stays in the bag.
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

// Returns the negated debit as the signed delta stored on the event, or null for a plain "Add".
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
      // #1648: promoted out of InventoryConsumableDetail — same value the nested consumableDetail create below carries.
      usesRemaining: source.detail.consumableDetail?.create.usesRemaining ?? null,
      // #1648: neither acquire source ever populates capabilities, so this is always built with capabilities: [].
      snapshot: buildInventorySnapshot({
        name: source.name,
        category: source.category,
        weight: source.weight ?? null,
        cost: source.cost ?? null,
        description: source.description ?? null,
        slot: source.slot,
        rarity: null,
        requiresAttunement: false,
        attunementPrereqKind: null,
        attunementPrereqValue: null,
        weaponDetail: source.detail.weaponDetail?.create ?? null,
        armorDetail: source.detail.armorDetail?.create ?? null,
        consumableDetail: source.detail.consumableDetail?.create ?? null,
        capabilities: [],
      }) as unknown as Prisma.InputJsonValue,
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
