import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import { logEvent } from "./events.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";

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
  weaponClass?: string;
  weaponRange?: string;
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

// Equips or unequips a single item. Unlike `update`, this IS logged so
// it appears on the activity timeline and is undoable.
export interface SetEquippedOperation {
  type: "setEquipped";
  inventoryItemId: string;
  equipped: boolean;
}

export type InventoryOperation =
  | AcquireOperation
  | AdjustQuantityOperation
  | UpdateOperation
  | RemoveOperation
  | SellOperation
  | SetEquippedOperation;

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

export const inventoryItemDetailInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
} satisfies Prisma.InventoryItemInclude;

type InventoryItemWithDetails = Prisma.InventoryItemGetPayload<{ include: typeof inventoryItemDetailInclude }>;

// The Item catalog include used when fetching a catalog Item's detail rows
// for snapshot — same shape as inventoryItemDetailInclude above but typed
// against Item (not InventoryItem). Exported so routes/characters.ts can
// build starting-equipment inventory rows at character creation time.
export const catalogItemDetailInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
} satisfies Prisma.ItemInclude;

export type CatalogItemWithDetails = Prisma.ItemGetPayload<{ include: typeof catalogItemDetailInclude }>;

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
    weaponClass: (input.weaponClass ?? null) as "simple" | "martial" | null,
    weaponRange: (input.weaponRange ?? null) as "melee" | "ranged" | null,
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
            weaponClass: item.weaponDetail.weaponClass,
            weaponRange: item.weaponDetail.weaponRange,
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

// ── Undo snapshot ────────────────────────────────────────────────────────────
//
// When an op DELETES an InventoryItem row (full sell, remove, adjust-to-zero)
// the relational row + its detail rows are gone, so `before`/`after` alone
// can't reconstruct it on undo. We stash a self-contained snapshot under
// `data.deletedItem` (NOT `before` — `before`/`after` feed diffToFields and
// would spray spurious field-diff rows; `data` is never diffed). On revert,
// revertInventoryEvent recreates the row from this snapshot reusing the
// original id. The detail blocks are typed as Prisma nested-create inputs so
// they drop straight into inventoryItem.create's `{ create: … }`.
export interface DeletedInventoryItemSnapshot {
  id: string;
  itemId: string | null;
  name: string;
  category: ItemCategoryName;
  weight: number | null;
  cost: Currency | null;
  description: string | null;
  quantity: number;
  equipped: boolean;
  notes: string | null;
  position: number;
  weaponDetail: Prisma.InventoryWeaponDetailCreateWithoutInventoryItemInput | null;
  armorDetail: Prisma.InventoryArmorDetailCreateWithoutInventoryItemInput | null;
  consumableDetail: Prisma.InventoryConsumableDetailCreateWithoutInventoryItemInput | null;
}

// Serializes an already-fetched InventoryItemWithDetails into the
// `data.deletedItem` snapshot. Mirror of snapshotItemDetail's field-by-field
// style, but reads from an InventoryItem (live row) rather than a catalog Item
// and keeps the scalar item columns alongside the detail blocks.
function snapshotInventoryItemForUndo(item: InventoryItemWithDetails): DeletedInventoryItemSnapshot {
  return {
    id: item.id,
    itemId: item.itemId,
    name: item.name,
    category: item.category,
    weight: item.weight,
    cost: asCurrency(item.cost),
    description: item.description,
    quantity: item.quantity,
    equipped: item.equipped,
    notes: item.notes,
    position: item.position,
    weaponDetail: item.weaponDetail
      ? {
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
          weaponClass: item.weaponDetail.weaponClass,
          weaponRange: item.weaponDetail.weaponRange,
        }
      : null,
    armorDetail: item.armorDetail
      ? {
          armorCategory: item.armorDetail.armorCategory,
          baseArmorClass: item.armorDetail.baseArmorClass,
          dexModifierApplies: item.armorDetail.dexModifierApplies,
          dexModifierMax: item.armorDetail.dexModifierMax,
          stealthDisadvantage: item.armorDetail.stealthDisadvantage,
          strengthRequirement: item.armorDetail.strengthRequirement,
        }
      : null,
    consumableDetail: item.consumableDetail
      ? {
          effectDiceCount: item.consumableDetail.effectDiceCount,
          effectDiceFaces: item.consumableDetail.effectDiceFaces,
          effectModifier: item.consumableDetail.effectModifier,
          effectDescription: item.consumableDetail.effectDescription,
        }
      : null,
  };
}

// Builds the nested-create payload for an InventoryItem from a catalog Item
// that has already been fetched with catalogItemDetailInclude. Used by
// routes/characters.ts to create starting-equipment rows atomically inside
// prisma.character.create, without going through applyInventoryOperations
// (which would write ledger rows — starting gear is a character's genesis
// state, not an economic event; same reasoning as prisma/seed.ts).
export function buildInventoryCreateFromCatalog(
  item: CatalogItemWithDetails,
  opts: { quantity: number; position: number }
) {
  return {
    itemId: item.id,
    name: item.name,
    category: item.category,
    weight: item.weight ?? undefined,
    cost: toJsonInput(asCurrency(item.cost)),
    description: item.description ?? undefined,
    quantity: opts.quantity,
    equipped: false,
    position: opts.position,
    ...snapshotItemDetail(item),
  };
}

// Minimal shape selectAutoEquip needs to decide what to equip — a subset of
// what buildInventoryCreateFromCatalog returns. Kept structural (not tied to
// that function's exact return type) so the rule stays unit-testable from a
// hand-written literal with no DB.
export interface AutoEquipCandidate {
  category: ItemCategoryName;
  position: number;
  weaponDetail?: { create: { twoHanded?: boolean | null } } | undefined;
  armorDetail?: { create: { armorCategory: ArmorCategoryName } } | undefined;
}

// 5e starting-equipment auto-equip rule, kept here in lib/ so it stays out of
// the creation route body. Given the InventoryItem create payloads for a new
// character's starting gear, returns the indices that should be marked
// `equipped: true`. Mirrors the same off-hand/two-handed constraints the read
// path derives (characters.ts): at most 2 weapons and 1 shield equipped; a
// two-handed weapon precludes a shield and a second weapon.
//
// Choices:
//   - Primary weapon = first weapon by position. Always equipped.
//   - If primary weapon is two-handed: no shield, no second weapon.
//   - Otherwise: also equip a shield (first armor with armorCategory "shield"),
//     at most one.
//   - Body armor (first non-shield armor) is equipped regardless of weapon grip.
export function selectAutoEquip(items: AutoEquipCandidate[]): number[] {
  const byPosition = (a: number, b: number) => items[a].position - items[b].position;

  const weaponIdx = items
    .map((_, i) => i)
    .filter((i) => items[i].category === "weapon" && Boolean(items[i].weaponDetail))
    .sort(byPosition);
  const shieldIdx = items
    .map((_, i) => i)
    .filter((i) => items[i].category === "armor" && items[i].armorDetail?.create.armorCategory === "shield")
    .sort(byPosition);
  const bodyArmorIdx = items
    .map((_, i) => i)
    .filter((i) => items[i].category === "armor" && items[i].armorDetail?.create.armorCategory !== "shield")
    .sort(byPosition);

  const selected: number[] = [];

  const primaryWeapon = weaponIdx[0];
  const primaryTwoHanded =
    primaryWeapon !== undefined && Boolean(items[primaryWeapon].weaponDetail?.create.twoHanded);
  if (primaryWeapon !== undefined) {
    selected.push(primaryWeapon);
  }

  // Body armor is always safe to equip — it never contends for the off-hand.
  if (bodyArmorIdx[0] !== undefined) {
    selected.push(bodyArmorIdx[0]);
  }

  // A two-handed primary weapon consumes the off-hand: no shield, no 2nd weapon.
  if (!primaryTwoHanded && shieldIdx[0] !== undefined) {
    selected.push(shieldIdx[0]);
  }

  return selected;
}

/** Formats a currency delta as "+7 gp" / "−5 gp 2 sp" for event summaries. */
function formatCurrencyForSummary(delta: Currency | null | undefined): string | null {
  if (!delta) return null;
  const parts: string[] = [];
  const sign = (delta.pp > 0 || delta.gp > 0 || delta.sp > 0 || delta.cp > 0) ? "+" : "−";
  if (delta.pp !== 0) parts.push(`${Math.abs(delta.pp)} pp`);
  if (delta.gp !== 0) parts.push(`${Math.abs(delta.gp)} gp`);
  if (delta.sp !== 0) parts.push(`${Math.abs(delta.sp)} sp`);
  if (delta.cp !== 0) parts.push(`${Math.abs(delta.cp)} cp`);
  if (parts.length === 0) return null;
  return `${sign}${parts.join(" ")}`;
}

async function applyAcquire(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AcquireOperation,
  batchId: string,
  sessionId: string | null,
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
      include: catalogItemDetailInclude,
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

  const eventType = currencyDelta ? "bought" : "acquired";
  const storedDelta = currencyDelta ? negate(currencyDelta) : null;
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

/**
 * Exported so the actions orchestrator (routes/actions.ts) can include
 * an adjustQuantity op inside a shared $transaction without re-opening one.
 * Keep in sync with the inline version — one code path, two callers.
 */
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
    // Only snapshot for undo when the row is actually deleted (quantity hits 0);
    // a partial adjust leaves the row, so `before.quantity` is enough to restore.
    data: {
      itemName: item.name,
      quantityDelta: op.delta,
      ...(nextQuantity === 0 ? { deletedItem: snapshotInventoryItemForUndo(item) } : {}),
    },
    batchId,
    sessionId,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      weaponDetail: op.weapon ? { update: op.weapon as any } : undefined,
      armorDetail: op.armor ? { update: op.armor } : undefined,
      consumableDetail: op.consumable ? { update: op.consumable } : undefined,
    },
  });
}

async function applySetEquipped(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: SetEquippedOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { equipped: op.equipped },
  });

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: op.equipped ? "equipped" : "unequipped",
    summary: op.equipped ? `Equipped ${item.name}` : `Unequipped ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { equipped: item.equipped },
    after: { equipped: op.equipped },
    batchId,
    sessionId,
  });
}

async function applyRemove(
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

  await tx.inventoryItem.delete({ where: { id: item.id } });
}

async function applySell(tx: Prisma.TransactionClient, characterId: string, op: SellOperation, batchId: string, sessionId: string | null) {
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
    // Only snapshot for undo when the FULL stack is sold (row deleted); a
    // partial sell leaves the row, so `before.quantity` is enough to restore.
    data: {
      itemName: item.name,
      quantityDelta: -quantitySold,
      currencyDelta: op.currencyDelta,
      ...(quantitySold === item.quantity ? { deletedItem: snapshotInventoryItemForUndo(item) } : {}),
    },
    batchId,
    sessionId,
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
  const sessionId = await getActiveSessionId(characterId);
  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      switch (op.type) {
        case "acquire":
          await applyAcquire(tx, characterId, op, batchId, sessionId);
          break;
        case "adjustQuantity":
          await applyAdjustQuantity(tx, characterId, op, batchId, sessionId);
          break;
        case "update":
          await applyUpdate(tx, characterId, op);
          break;
        case "remove":
          await applyRemove(tx, characterId, op, batchId, sessionId);
          break;
        case "sell":
          await applySell(tx, characterId, op, batchId, sessionId);
          break;
        case "setEquipped":
          await applySetEquipped(tx, characterId, op, batchId, sessionId);
          break;
      }
    }
  });
}
