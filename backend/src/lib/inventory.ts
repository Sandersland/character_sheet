import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";

// Same {cp,sp,gp,pp} shape as Character.currency and Item/InventoryItem.cost.
// The index signature is just to satisfy Prisma's InputJsonObject structural
// requirement when this gets written to a Json column — every real field is
// still named and typed above it.
export interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
  [key: string]: number;
}

export class InsufficientCurrencyError extends Error {}
export class InvalidInventoryOperationError extends Error {}

function applyCurrencyDelta(current: Currency, delta: Currency, sign: 1 | -1): Currency {
  const next: Currency = {
    cp: current.cp + sign * delta.cp,
    sp: current.sp + sign * delta.sp,
    gp: current.gp + sign * delta.gp,
    pp: current.pp + sign * delta.pp,
  };
  if (next.cp < 0 || next.sp < 0 || next.gp < 0 || next.pp < 0) {
    throw new InsufficientCurrencyError("Not enough currency for this transaction");
  }
  return next;
}

// No cross-denomination "making change" — the frontend always edits the
// same 4 fields it prefilled from the catalog's `cost`, so a debit/credit
// is applied per-denomination, not as a single fungible total.
export function currencyDebit(current: Currency, amount: Currency): Currency {
  return applyCurrencyDelta(current, amount, -1);
}

export function currencyCredit(current: Currency, amount: Currency): Currency {
  return applyCurrencyDelta(current, amount, 1);
}

function hasNonzeroCurrency(currency: Currency | undefined): currency is Currency {
  if (!currency) return false;
  return currency.cp !== 0 || currency.sp !== 0 || currency.gp !== 0 || currency.pp !== 0;
}

function negate(currency: Currency): Currency {
  return { cp: -currency.cp, sp: -currency.sp, gp: -currency.gp, pp: -currency.pp };
}

function asCurrency(json: Prisma.JsonValue | null): Currency | null {
  return json as Currency | null;
}

function toJsonInput(value: Currency | null | undefined): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value ?? Prisma.JsonNull;
}

export type ItemCategoryName = "weapon" | "armor" | "consumable" | "gear";
export type ArmorCategoryName = "light" | "medium" | "heavy" | "shield";

// Mirrors ItemWeaponDetail/ItemArmorDetail/ItemConsumableDetail's own
// fields (minus id/FK) — see prisma/seed.ts's CatalogItem-adjacent
// interfaces, which this deliberately matches.
export interface WeaponDetailInput {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier?: number;
  damageType: string;
  versatileDiceCount?: number;
  versatileDiceFaces?: number;
  finesse?: boolean;
  light?: boolean;
  heavy?: boolean;
  twoHanded?: boolean;
  reach?: boolean;
  thrown?: boolean;
  ammunition?: boolean;
  rangeNormal?: number;
  rangeLong?: number;
}

export interface ArmorDetailInput {
  armorCategory: ArmorCategoryName;
  baseArmorClass: number;
  dexModifierApplies?: boolean;
  dexModifierMax?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}

export interface ConsumableDetailInput {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
}

export interface CustomItemInput {
  name: string;
  category: ItemCategoryName;
  weight?: number;
  cost?: Currency;
  description?: string;
  weapon?: WeaponDetailInput;
  armor?: ArmorDetailInput;
  consumable?: ConsumableDetailInput;
}

// Gains a new InventoryItem row, either snapshotted from the catalog
// (itemId) or fully homebrew (custom) — exactly one of the two. An
// optional currencyDelta (debit) is the "Add vs Buy" merge: one op type,
// ledger type depends on whether a nonzero amount was charged.
export interface AcquireOperation {
  type: "acquire";
  itemId?: string;
  custom?: CustomItemInput;
  quantity?: number;
  equipped?: boolean;
  notes?: string;
  currencyDelta?: Currency;
}

// +/- on an existing row's quantity. Reaching 0 deletes the row. Ledger
// type is derived from the sign: gaining more counts as "acquired",
// losing some (used up, dropped a few, whatever) counts as "consumed".
export interface AdjustQuantityOperation {
  type: "adjustQuantity";
  inventoryItemId: string;
  delta: number;
}

// Cosmetic edit — never logged. weapon/armor/consumable overrides are
// partial (only provided fields change); this is the "Club +1" path,
// e.g. bumping just `weapon.damageModifier`.
export interface UpdateOperation {
  type: "update";
  inventoryItemId: string;
  name?: string;
  notes?: string | null;
  equipped?: boolean;
  weight?: number;
  cost?: Currency;
  description?: string;
  weapon?: Partial<WeaponDetailInput>;
  armor?: Partial<ArmorDetailInput>;
  consumable?: Partial<ConsumableDetailInput>;
}

// Deletes a row outright, regardless of quantity — "I'm getting rid of
// this entirely," as distinct from adjustQuantity's "used some of it up."
export interface RemoveOperation {
  type: "remove";
  inventoryItemId: string;
}

// Sells some or all of a stack for a player-typed amount (the frontend
// prefills it from the catalog's cost, but always sends the final figure).
export interface SellOperation {
  type: "sell";
  inventoryItemId: string;
  quantity?: number;
  currencyDelta: Currency;
}

export type InventoryOperation =
  | AcquireOperation
  | AdjustQuantityOperation
  | UpdateOperation
  | RemoveOperation
  | SellOperation;

async function getCharacterCurrency(tx: Prisma.TransactionClient, characterId: string): Promise<Currency> {
  const character = await tx.character.findUnique({ where: { id: characterId }, select: { currency: true } });
  if (!character) {
    throw new InvalidInventoryOperationError(`Character not found: ${characterId}`);
  }
  return asCurrency(character.currency) ?? { cp: 0, sp: 0, gp: 0, pp: 0 };
}

async function setCharacterCurrency(tx: Prisma.TransactionClient, characterId: string, currency: Currency) {
  await tx.character.update({ where: { id: characterId }, data: { currency } });
}

const inventoryItemDetailInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
} satisfies Prisma.InventoryItemInclude;

type InventoryItemWithDetails = Prisma.InventoryItemGetPayload<{ include: typeof inventoryItemDetailInclude }>;

// Every op past `acquire` operates on an existing row — this is the one
// place ownership is checked, so a stray inventoryItemId can't touch
// another character's inventory.
async function getOwnedInventoryItem(
  tx: Prisma.TransactionClient,
  characterId: string,
  inventoryItemId: string
): Promise<InventoryItemWithDetails> {
  const item = await tx.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: inventoryItemDetailInclude,
  });
  if (!item || item.characterId !== characterId) {
    throw new InvalidInventoryOperationError(`Inventory item not found on this character: ${inventoryItemId}`);
  }
  return item;
}

async function nextPosition(tx: Prisma.TransactionClient, characterId: string): Promise<number> {
  return tx.inventoryItem.count({ where: { characterId } });
}

// Fills in every optional field's default explicitly — a custom item's
// detail block comes from a Zod-validated but otherwise free-form object
// (`WeaponDetailInput` etc., all-optional past the required fields), and
// Prisma's nested `create` input wants concrete values, not `undefined`,
// for fields the schema defaults (damageModifier, finesse, ...) or allows
// null (versatileDiceCount, rangeNormal, ...).
function normalizeWeaponDetail(input: WeaponDetailInput) {
  return {
    damageDiceCount: input.damageDiceCount,
    damageDiceFaces: input.damageDiceFaces,
    damageModifier: input.damageModifier ?? 0,
    damageType: input.damageType,
    versatileDiceCount: input.versatileDiceCount ?? null,
    versatileDiceFaces: input.versatileDiceFaces ?? null,
    finesse: input.finesse ?? false,
    light: input.light ?? false,
    heavy: input.heavy ?? false,
    twoHanded: input.twoHanded ?? false,
    reach: input.reach ?? false,
    thrown: input.thrown ?? false,
    ammunition: input.ammunition ?? false,
    rangeNormal: input.rangeNormal ?? null,
    rangeLong: input.rangeLong ?? null,
  };
}

function normalizeArmorDetail(input: ArmorDetailInput) {
  return {
    armorCategory: input.armorCategory,
    baseArmorClass: input.baseArmorClass,
    dexModifierApplies: input.dexModifierApplies ?? false,
    dexModifierMax: input.dexModifierMax ?? null,
    stealthDisadvantage: input.stealthDisadvantage ?? false,
    strengthRequirement: input.strengthRequirement ?? null,
  };
}

function normalizeConsumableDetail(input: ConsumableDetailInput) {
  return {
    effectDiceCount: input.effectDiceCount ?? null,
    effectDiceFaces: input.effectDiceFaces ?? null,
    effectModifier: input.effectModifier ?? null,
    effectDescription: input.effectDescription ?? null,
  };
}

type CatalogItemWithDetails = Prisma.ItemGetPayload<{ include: typeof inventoryItemDetailInclude }>;

// Reads a catalog Item's (already-included) weapon/armor/consumable detail
// rows and builds the nested-create payload for a new InventoryItem's own
// copy — the live-DB counterpart to prisma/seed.ts's itemDetailCreateFields,
// which does the same thing from a seed-time literal instead of a DB read.
function snapshotItemDetail(item: CatalogItemWithDetails) {
  return {
    weaponDetail: item.weaponDetail
      ? {
          create: {
            damageDiceCount: item.weaponDetail.damageDiceCount,
            damageDiceFaces: item.weaponDetail.damageDiceFaces,
            damageModifier: item.weaponDetail.damageModifier,
            damageType: item.weaponDetail.damageType,
            versatileDiceCount: item.weaponDetail.versatileDiceCount,
            versatileDiceFaces: item.weaponDetail.versatileDiceFaces,
            finesse: item.weaponDetail.finesse,
            light: item.weaponDetail.light,
            heavy: item.weaponDetail.heavy,
            twoHanded: item.weaponDetail.twoHanded,
            reach: item.weaponDetail.reach,
            thrown: item.weaponDetail.thrown,
            ammunition: item.weaponDetail.ammunition,
            rangeNormal: item.weaponDetail.rangeNormal,
            rangeLong: item.weaponDetail.rangeLong,
          },
        }
      : undefined,
    armorDetail: item.armorDetail
      ? {
          create: {
            armorCategory: item.armorDetail.armorCategory,
            baseArmorClass: item.armorDetail.baseArmorClass,
            dexModifierApplies: item.armorDetail.dexModifierApplies,
            dexModifierMax: item.armorDetail.dexModifierMax,
            stealthDisadvantage: item.armorDetail.stealthDisadvantage,
            strengthRequirement: item.armorDetail.strengthRequirement,
          },
        }
      : undefined,
    consumableDetail: item.consumableDetail
      ? {
          create: {
            effectDiceCount: item.consumableDetail.effectDiceCount,
            effectDiceFaces: item.consumableDetail.effectDiceFaces,
            effectModifier: item.consumableDetail.effectModifier,
            effectDescription: item.consumableDetail.effectDescription,
          },
        }
      : undefined,
  };
}

interface LogParams {
  characterId: string;
  inventoryItemId: string | null;
  itemName: string;
  type: "acquired" | "consumed" | "sold" | "bought" | "removed";
  quantityDelta: number;
  currencyDelta?: Currency | null;
  batchId: string;
}

async function logTransaction(tx: Prisma.TransactionClient, params: LogParams) {
  await tx.inventoryTransaction.create({
    data: {
      characterId: params.characterId,
      inventoryItemId: params.inventoryItemId,
      itemName: params.itemName,
      type: params.type,
      quantityDelta: params.quantityDelta,
      currencyDelta: toJsonInput(params.currencyDelta ?? null),
      batchId: params.batchId,
    },
  });
}

async function applyAcquire(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AcquireOperation,
  batchId: string
) {
  const quantity = op.quantity ?? 1;
  const position = await nextPosition(tx, characterId);

  let itemId: string | null;
  let name: string;
  let category: ItemCategoryName;
  let weight: number | undefined;
  let cost: Currency | undefined;
  let description: string | undefined;
  let detail: ReturnType<typeof snapshotItemDetail>;

  if (op.itemId) {
    const catalogItem = await tx.item.findUnique({
      where: { id: op.itemId },
      include: inventoryItemDetailInclude,
    });
    if (!catalogItem) {
      throw new InvalidInventoryOperationError(`Unknown catalog item: ${op.itemId}`);
    }
    itemId = catalogItem.id;
    name = catalogItem.name;
    category = catalogItem.category;
    weight = catalogItem.weight ?? undefined;
    cost = asCurrency(catalogItem.cost) ?? undefined;
    description = catalogItem.description ?? undefined;
    detail = snapshotItemDetail(catalogItem);
  } else if (op.custom) {
    itemId = null;
    name = op.custom.name;
    category = op.custom.category;
    weight = op.custom.weight;
    cost = op.custom.cost;
    description = op.custom.description;
    detail = {
      weaponDetail: op.custom.weapon ? { create: normalizeWeaponDetail(op.custom.weapon) } : undefined,
      armorDetail: op.custom.armor ? { create: normalizeArmorDetail(op.custom.armor) } : undefined,
      consumableDetail: op.custom.consumable
        ? { create: normalizeConsumableDetail(op.custom.consumable) }
        : undefined,
    };
  } else {
    throw new InvalidInventoryOperationError("acquire requires either itemId or custom");
  }

  const created = await tx.inventoryItem.create({
    data: {
      characterId,
      itemId,
      name,
      category,
      weight,
      cost: toJsonInput(cost),
      description,
      quantity,
      equipped: op.equipped ?? false,
      notes: op.notes,
      position,
      ...detail,
    },
  });

  const currencyDelta = hasNonzeroCurrency(op.currencyDelta) ? op.currencyDelta : null;
  if (currencyDelta) {
    const currency = await getCharacterCurrency(tx, characterId);
    await setCharacterCurrency(tx, characterId, currencyDebit(currency, currencyDelta));
  }

  await logTransaction(tx, {
    characterId,
    inventoryItemId: created.id,
    itemName: created.name,
    type: currencyDelta ? "bought" : "acquired",
    quantityDelta: quantity,
    currencyDelta: currencyDelta ? negate(currencyDelta) : null,
    batchId,
  });
}

async function applyAdjustQuantity(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AdjustQuantityOperation,
  batchId: string
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  const nextQuantity = item.quantity + op.delta;
  if (nextQuantity < 0) {
    throw new InvalidInventoryOperationError(`Cannot reduce ${item.name} below zero`);
  }

  await logTransaction(tx, {
    characterId,
    inventoryItemId: item.id,
    itemName: item.name,
    type: op.delta > 0 ? "acquired" : "consumed",
    quantityDelta: op.delta,
    currencyDelta: null,
    batchId,
  });

  if (nextQuantity === 0) {
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
  }
}

async function applyUpdate(tx: Prisma.TransactionClient, characterId: string, op: UpdateOperation) {
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
      equipped: op.equipped,
      weight: op.weight,
      cost: op.cost !== undefined ? toJsonInput(op.cost) : undefined,
      description: op.description,
      weaponDetail: op.weapon ? { update: op.weapon } : undefined,
      armorDetail: op.armor ? { update: op.armor } : undefined,
      consumableDetail: op.consumable ? { update: op.consumable } : undefined,
    },
  });
}

async function applyRemove(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: RemoveOperation,
  batchId: string
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);

  await logTransaction(tx, {
    characterId,
    inventoryItemId: item.id,
    itemName: item.name,
    type: "removed",
    quantityDelta: -item.quantity,
    currencyDelta: null,
    batchId,
  });

  await tx.inventoryItem.delete({ where: { id: item.id } });
}

async function applySell(tx: Prisma.TransactionClient, characterId: string, op: SellOperation, batchId: string) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  const quantitySold = op.quantity ?? item.quantity;
  if (quantitySold <= 0 || quantitySold > item.quantity) {
    throw new InvalidInventoryOperationError(`Cannot sell ${quantitySold}x ${item.name} (have ${item.quantity})`);
  }

  const currency = await getCharacterCurrency(tx, characterId);
  await setCharacterCurrency(tx, characterId, currencyCredit(currency, op.currencyDelta));

  await logTransaction(tx, {
    characterId,
    inventoryItemId: item.id,
    itemName: item.name,
    type: "sold",
    quantityDelta: -quantitySold,
    currencyDelta: op.currencyDelta,
    batchId,
  });

  if (quantitySold === item.quantity) {
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: item.quantity - quantitySold } });
  }
}

// Applies a batch of operations atomically — one InventoryTransaction
// batchId groups whatever ledger rows the batch produces (a single inline
// edit is a batch of one; a bulk action is a batch of several). Any thrown
// error rolls back the entire batch, including currency changes.
export async function applyInventoryOperations(
  characterId: string,
  operations: InventoryOperation[]
): Promise<void> {
  const batchId = randomUUID();
  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      switch (op.type) {
        case "acquire":
          await applyAcquire(tx, characterId, op, batchId);
          break;
        case "adjustQuantity":
          await applyAdjustQuantity(tx, characterId, op, batchId);
          break;
        case "update":
          await applyUpdate(tx, characterId, op);
          break;
        case "remove":
          await applyRemove(tx, characterId, op, batchId);
          break;
        case "sell":
          await applySell(tx, characterId, op, batchId);
          break;
      }
    }
  });
}
