import { randomUUID } from "node:crypto";

import { Prisma, type EquipSlot, type ItemRarity } from "../generated/prisma/client.js";
import {
  activatedMaxUses,
  activatedRechargeRest,
  type AttunementPrereqKind,
  chargePoolOf,
  describeAttunementPrereq,
  meetsAttunementPrereq,
  readCapability,
  type ActivatedEffectCapability,
} from "./capabilities.js";
import {
  appendActiveBuffInTx,
  clearBuffByKeyInTx,
  normalizeActiveEffectsMutable,
} from "./active-effects.js";
import { rollDie } from "./dice.js";
import { logEvent } from "./events.js";
import { applyHealInTx } from "./hitpoints.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";

// 5e: a character can attune to at most 3 magic items (DMG p. 138). Derived
// (counted from live rows), never persisted.
export const ATTUNEMENT_LIMIT = 3;

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
// Attunement cap breach — carries an explicit 409 (conflict) so the transactions
// endpoint surfaces it distinctly from a plain 400 validation error.
export class AttunementLimitError extends InvalidInventoryOperationError {
  status = 409;
}

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
  maxUses?: number;
  usesRemaining?: number;
}

// A consumable auto-applies its effect only when it heals (#121). Non-heal
// effects are rolled + recorded but never applied server-side.
export function isHealingConsumable(effectDescription: string | null | undefined): boolean {
  if (!effectDescription) return false;
  return /hit point|\bheal/i.test(effectDescription);
}

export interface CustomItemInput {
  name: string;
  category: ItemCategoryName;
  weight?: number;
  cost?: Currency;
  description?: string;
  // Paper-doll slot for wearable custom gear (#565); null/omitted = bag-only.
  slot?: EquipSlot;
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
// e.g. bumping just `weapon.damageModifier`. Placement is NOT edited here —
// equip/unequip go through the `equip`/`setEquipped` ops so they're logged.
export interface UpdateOperation {
  type: "update";
  inventoryItemId: string;
  name?: string;
  notes?: string | null;
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

// Equips a single item into an explicit paper-doll slot (#565). Logged +
// undoable. Validates slot-compatibility, capacity (RING 2, else 1), and the
// two-handed off-hand lock. Rejects a full slot (no silent displacement).
export interface EquipOperation {
  type: "equip";
  inventoryItemId: string;
  slot: EquipSlot;
}

// Equips (auto-picking the first free compatible slot) or unequips a single
// item. Unlike `update`, this IS logged so it appears on the activity timeline
// and is undoable. The slot-less companion to `equip` — unequip clears
// equippedSlot; equip=true delegates to the same placement rules as `equip`.
export interface SetEquippedOperation {
  type: "setEquipped";
  inventoryItemId: string;
  equipped: boolean;
}

// Attunes an item (#545). Logged + undoable. Enforces the derived 3-item cap
// (409 on the 4th) and the snapshotted attunement prerequisite.
export interface AttuneOperation {
  type: "attune";
  inventoryItemId: string;
}

// Ends attunement. Logged + undoable; always legal so a stuck row can clear.
export interface UnattuneOperation {
  type: "unattune";
  inventoryItemId: string;
}

// Activates an item's activatedEffect capability (#543): spends a use and seeds
// the while-active/until-rest self-buff. Logged + undoable.
export interface ActivateOperation {
  type: "activate";
  inventoryItemId: string;
}

// Toggles off an active item effect (#543): clears the seeded buff. The spent use
// is NOT restored (it recharges on the matching rest). Logged + undoable.
export interface DeactivateOperation {
  type: "deactivate";
  inventoryItemId: string;
}

// Consumes one use of a consumable (#121). Stackable (maxUses null) decrements
// quantity; charged (maxUses set) decrements usesRemaining. Rolls the effect
// dice (client-supplied for the 3D animation, else server-rolled) and
// auto-applies ONLY healing through the HP domain. Logged + LIFO-undoable.
export interface UseOperation {
  type: "use";
  inventoryItemId: string;
  // Raw effect-die values. When present, length must equal effectDiceCount and
  // each be in 1..effectDiceFaces; when absent the server rolls.
  rolls?: number[];
}

export type InventoryOperation =
  | AcquireOperation
  | AdjustQuantityOperation
  | UpdateOperation
  | RemoveOperation
  | SellOperation
  | EquipOperation
  | SetEquippedOperation
  | AttuneOperation
  | UnattuneOperation
  | ActivateOperation
  | DeactivateOperation
  | UseOperation;

// The while-active buff key an item's activatedEffect seeds. One buff per item.
export function itemBuffKey(inventoryItemId: string): string {
  return `item:${inventoryItemId}`;
}

// The (first) activatedEffect capability on a live inventory row, or null.
function activatedCapabilityOf(item: InventoryItemWithDetails): ActivatedEffectCapability | null {
  for (const col of item.capabilities) {
    const cap = readCapability(col);
    // Type-predicate guard (not a bare kind check): an opaque row with
    // kind="activatedEffect" but no activation must not be returned as a
    // malformed ActivatedEffectCapability — applyActivate would seed a buff
    // with target/modifier undefined.
    if (cap.kind === "activatedEffect" && "activation" in cap) return cap;
  }
  return null;
}

// Per-use outcome surfaced to the client so it can play the 3D dice animation
// and toast the result. `applied` is "heal" only when the effect auto-applied.
export interface UseResult {
  inventoryItemId: string;
  itemName: string;
  effectDescription: string | null;
  rolls: number[];
  effectModifier: number;
  total: number | null;
  applied: "heal" | null;
  usesRemaining: number | null;
  quantity: number | null;
}

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
  capabilities: true,
} satisfies Prisma.InventoryItemInclude;

export type InventoryItemWithDetails = Prisma.InventoryItemGetPayload<{ include: typeof inventoryItemDetailInclude }>;

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
  const maxUses = input.maxUses ?? null;
  return {
    effectDiceCount: input.effectDiceCount ?? null,
    effectDiceFaces: input.effectDiceFaces ?? null,
    effectModifier: input.effectModifier ?? null,
    effectDescription: input.effectDescription ?? null,
    maxUses,
    // A fresh charged consumable starts full: default usesRemaining to maxUses.
    usesRemaining: input.usesRemaining ?? maxUses,
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
            maxUses: item.consumableDetail.maxUses,
            // A freshly-snapshotted charged consumable starts full.
            usesRemaining: item.consumableDetail.usesRemaining ?? item.consumableDetail.maxUses,
          },
        }
      : undefined,
  };
}

// ── Paper-doll placement (#565) ──────────────────────────────────────────────
//
// equippedSlot is the single source of truth for "is this equipped" — the wire
// `equipped` field derives from (equippedSlot != null). RING holds 2 items;
// every other slot holds 1. A two-handed weapon sits in MAIN_HAND and LOCKS
// OFF_HAND (never a second row). Full slots are rejected, not silently displaced.

const RING_SLOT_CAPACITY = 2;

function slotCapacity(slot: EquipSlot): number {
  return slot === "RING" ? RING_SLOT_CAPACITY : 1;
}

// Human-readable slot name for event summaries / error messages.
function slotLabel(slot: EquipSlot): string {
  return slot.toLowerCase().replace(/_/g, " ");
}

// Minimal shape the placement rules read — a subset of InventoryItemWithDetails.
interface PlaceableItem {
  category: ItemCategoryName;
  slot: EquipSlot | null;
  weaponDetail: { twoHanded: boolean } | null;
  armorDetail: { armorCategory: ArmorCategoryName } | null;
}

function isTwoHandedWeapon(item: PlaceableItem): boolean {
  return item.category === "weapon" && Boolean(item.weaponDetail?.twoHanded);
}

// The slots an item may legally occupy. Weapons/body armor derive from detail
// data; gear declares its slot (null = bag-only). Empty = not equippable.
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

// Other currently-equipped rows, with just the two-handed flag needed for the
// off-hand lock. Excludes the item being (re)placed so a re-slot never self-collides.
type EquippedRow = { equippedSlot: EquipSlot | null; weaponDetail: { twoHanded: boolean } | null };

async function fetchEquippedRows(
  tx: Prisma.TransactionClient,
  characterId: string,
  excludeId: string,
): Promise<EquippedRow[]> {
  return tx.inventoryItem.findMany({
    where: { characterId, equippedSlot: { not: null }, id: { not: excludeId } },
    select: { equippedSlot: true, weaponDetail: { select: { twoHanded: true } } },
  });
}

// Returns a clear error string if `item` may NOT occupy `slot` given the other
// equipped rows, or null when the placement is legal.
function placementError(rows: EquippedRow[], item: PlaceableItem, slot: EquipSlot): string | null {
  const allowed = allowedSlotsForItem(item);
  if (allowed.length === 0) return `${item.category} items cannot be equipped`;
  if (!allowed.includes(slot)) return `This item cannot be equipped in the ${slotLabel(slot)} slot`;

  const mainHandTwoHanded = rows.some((r) => r.equippedSlot === "MAIN_HAND" && r.weaponDetail?.twoHanded);
  const offHandOccupied = rows.some((r) => r.equippedSlot === "OFF_HAND");
  if (slot === "OFF_HAND" && mainHandTwoHanded) {
    return "The off-hand is locked by a two-handed weapon — unequip it first";
  }
  if (isTwoHandedWeapon(item) && offHandOccupied) {
    return "A two-handed weapon needs a free off-hand — unequip your off-hand first";
  }

  const occupants = rows.filter((r) => r.equippedSlot === slot).length;
  if (occupants >= slotCapacity(slot)) return `The ${slotLabel(slot)} slot is full`;
  return null;
}

// First allowed slot with a legal placement, or null when none is available.
function firstFreeSlot(rows: EquippedRow[], item: PlaceableItem): EquipSlot | null {
  for (const slot of allowedSlotsForItem(item)) {
    if (placementError(rows, item, slot) === null) return slot;
  }
  return null;
}

// Places an item into a validated slot + logs the undoable `equipped` event.
async function equipIntoSlot(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  slot: EquipSlot,
  batchId: string,
  sessionId: string | null,
) {
  await tx.inventoryItem.update({ where: { id: item.id }, data: { equippedSlot: slot } });
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
  campaignItemId: string | null;
  name: string;
  category: ItemCategoryName;
  weight: number | null;
  cost: Currency | null;
  description: string | null;
  quantity: number;
  equippedSlot: EquipSlot | null;
  slot: EquipSlot | null;
  rarity: ItemRarity | null;
  attuned: boolean;
  requiresAttunement: boolean;
  attunementPrereqKind: AttunementPrereqKind | null;
  attunementPrereqValue: string | null;
  notes: string | null;
  position: number;
  weaponDetail: Prisma.InventoryWeaponDetailCreateWithoutInventoryItemInput | null;
  armorDetail: Prisma.InventoryArmorDetailCreateWithoutInventoryItemInput | null;
  consumableDetail: Prisma.InventoryConsumableDetailCreateWithoutInventoryItemInput | null;
  capabilities: Prisma.InventoryCapabilityCreateWithoutInventoryItemInput[];
}

// Serializes an already-fetched InventoryItemWithDetails into the
// `data.deletedItem` snapshot. Mirror of snapshotItemDetail's field-by-field
// style, but reads from an InventoryItem (live row) rather than a catalog Item
// and keeps the scalar item columns alongside the detail blocks.
export function snapshotInventoryItemForUndo(item: InventoryItemWithDetails): DeletedInventoryItemSnapshot {
  return {
    id: item.id,
    itemId: item.itemId,
    campaignItemId: item.campaignItemId,
    name: item.name,
    category: item.category,
    weight: item.weight,
    cost: asCurrency(item.cost),
    description: item.description,
    quantity: item.quantity,
    equippedSlot: item.equippedSlot,
    slot: item.slot,
    rarity: item.rarity,
    attuned: item.attuned,
    requiresAttunement: item.requiresAttunement,
    attunementPrereqKind: item.attunementPrereqKind,
    attunementPrereqValue: item.attunementPrereqValue,
    notes: item.notes,
    position: item.position,
    capabilities: item.capabilities.map((c) => ({
      kind: c.kind,
      description: c.description,
      target: c.target,
      op: c.op,
      value: c.value,
      targetKey: c.targetKey,
      condition: c.condition,
      valueDiceCount: c.valueDiceCount,
      valueDiceFaces: c.valueDiceFaces,
      valueDamageType: c.valueDamageType,
      spellId: c.spellId,
      spellName: c.spellName,
      spellLevel: c.spellLevel,
      castLevel: c.castLevel,
      castResource: c.castResource,
      castUses: c.castUses,
      castConcentration: c.castConcentration,
      dcMode: c.dcMode,
      dcValue: c.dcValue,
      attackMode: c.attackMode,
      attackValue: c.attackValue,
      activation: c.activation,
      activatedDuration: c.activatedDuration,
      resourceKind: c.resourceKind,
      resourcePeriod: c.resourcePeriod,
      resourceCharges: c.resourceCharges,
      durationText: c.durationText,
      grantType: c.grantType,
      grantOn: c.grantOn,
      grantValueKind: c.grantValueKind,
      grantValue: c.grantValue,
      cantBeSurprised: c.cantBeSurprised,
      maxCharges: c.maxCharges,
      rechargeDiceCount: c.rechargeDiceCount,
      rechargeDiceFaces: c.rechargeDiceFaces,
      rechargeBonus: c.rechargeBonus,
      rechargeTrigger: c.rechargeTrigger,
      chargeCost: c.chargeCost,
      // Runtime counter: undo-of-delete restores the row verbatim, spend state included.
      used: c.used,
    })),
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
          maxUses: item.consumableDetail.maxUses,
          usesRemaining: item.consumableDetail.usesRemaining,
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
    // Placement is assigned by the auto-equip pass (autoEquipSlot); null = in the bag.
    equippedSlot: null as EquipSlot | null,
    slot: item.slot,
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

// The paper-doll slot an auto-equipped starting-gear candidate occupies (#565).
// selectAutoEquip only ever picks one weapon (MAIN_HAND), one shield (OFF_HAND),
// and one body armor (BODY), so this mapping is unambiguous.
export function autoEquipSlot(item: AutoEquipCandidate): EquipSlot {
  if (item.category === "weapon") return "MAIN_HAND";
  if (item.armorDetail?.create.armorCategory === "shield") return "OFF_HAND";
  return "BODY";
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
  let slot: EquipSlot | null = null;
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
    slot = catalogItem.slot;
    detail = snapshotItemDetail(catalogItem);
  } else if (op.custom) {
    itemId = null;
    name = op.custom.name;
    category = op.custom.category;
    weight = op.custom.weight;
    cost = op.custom.cost;
    description = op.custom.description;
    slot = op.custom.slot ?? null;
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
      equippedSlot: null,
      slot,
      notes: op.notes,
      position,
      ...detail,
    },
  });

  // "Add & equip": auto-place into the first free compatible slot (#565). Silent
  // (no separate equipped event) — a fresh acquire that can't be slotted stays in
  // the bag rather than failing the acquire.
  if (op.equipped) {
    const placeable: PlaceableItem = {
      category,
      slot,
      weaponDetail: detail.weaponDetail ? { twoHanded: Boolean(detail.weaponDetail.create.twoHanded) } : null,
      armorDetail: detail.armorDetail ? { armorCategory: detail.armorDetail.create.armorCategory } : null,
    };
    const rows = await fetchEquippedRows(tx, characterId, created.id);
    const autoSlot = firstFreeSlot(rows, placeable);
    if (autoSlot) {
      await tx.inventoryItem.update({ where: { id: created.id }, data: { equippedSlot: autoSlot } });
    }
  }

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
    // Adjusting to zero deletes the row — clear any seeded buff so it can't leak.
    await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `used up ${item.name}`);
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
  }
}

// Consumes one use of a consumable (#121). Ammo is gear, not consumable, so it
// is excluded here without any ammoKind dependency. Rolls the effect dice, logs
// a `consumed` event with the roll in `data`, and auto-applies ONLY healing.
async function applyUse(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: UseOperation,
  batchId: string,
  sessionId: string | null,
): Promise<UseResult> {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  if (item.category !== "consumable") {
    throw new InvalidInventoryOperationError(`${item.name} (${item.category}) is not a consumable`);
  }
  const detail = item.consumableDetail;
  const charged = detail?.maxUses != null;

  // Roll the effect dice (client-supplied for the 3D animation, else server-rolled).
  const diceCount = detail?.effectDiceCount ?? 0;
  const faces = detail?.effectDiceFaces ?? 0;
  const modifier = detail?.effectModifier ?? 0;
  let rolls: number[] = [];
  let total: number | null = null;
  if (diceCount > 0 && faces > 0) {
    if (op.rolls) {
      if (op.rolls.length !== diceCount || op.rolls.some((r) => r < 1 || r > faces)) {
        throw new InvalidInventoryOperationError(
          `${item.name} effect roll must be ${diceCount}d${faces}`,
        );
      }
      rolls = op.rolls;
    } else {
      rolls = Array.from({ length: diceCount }, () => rollDie(faces));
    }
    total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  }

  // Decrement quantity (stackable) or usesRemaining (charged). A charged item at
  // 0 uses stays with Use disabled until a long rest recharges it.
  let before: Record<string, unknown>;
  let after: Record<string, unknown> | null;
  let deletedItem: DeletedInventoryItemSnapshot | undefined;
  let remainingUses: number | null = null;
  let remainingQty: number | null = null;

  if (charged) {
    const current = detail?.usesRemaining ?? 0;
    if (current <= 0) {
      throw new InvalidInventoryOperationError(`${item.name} has no uses remaining`);
    }
    remainingUses = current - 1;
    before = { usesRemaining: current };
    after = { usesRemaining: remainingUses };
  } else {
    if (item.quantity <= 0) {
      throw new InvalidInventoryOperationError(`${item.name} has none left to use`);
    }
    remainingQty = item.quantity - 1;
    before = { quantity: item.quantity };
    after = remainingQty === 0 ? null : { quantity: remainingQty };
    if (remainingQty === 0) deletedItem = snapshotInventoryItemForUndo(item);
  }

  // Auto-apply healing only — non-heal effects are rolled + recorded, not applied.
  const healing = isHealingConsumable(detail?.effectDescription);
  let applied: "heal" | null = null;
  if (healing && total !== null && total > 0) {
    await applyHealInTx(tx, characterId, total, batchId, sessionId, { source: item.name });
    applied = "heal";
  }

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "consumed",
    summary: total !== null ? `Used ${item.name} (rolled ${total})` : `Used ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before,
    after,
    data: {
      itemName: item.name,
      use: true,
      rolls,
      effectModifier: modifier,
      total,
      applied,
      effectDescription: detail?.effectDescription ?? null,
      ...(deletedItem ? { deletedItem } : {}),
    },
    batchId,
    sessionId,
  });

  if (charged) {
    await tx.inventoryConsumableDetail.update({
      where: { inventoryItemId: item.id },
      data: { usesRemaining: remainingUses ?? 0 },
    });
  } else if (remainingQty === 0) {
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: remainingQty ?? 0 } });
  }

  return {
    inventoryItemId: item.id,
    itemName: item.name,
    effectDescription: detail?.effectDescription ?? null,
    rolls,
    effectModifier: modifier,
    total,
    applied,
    usesRemaining: remainingUses,
    quantity: remainingQty,
  };
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

// Equips an item into an explicit slot (#565). Validates slot-compatibility,
// capacity, and the two-handed off-hand lock; rejects a full slot.
async function applyEquip(
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

// Unequips (equipped=false) by clearing equippedSlot, or equips (equipped=true)
// by auto-picking the first free compatible slot — the slot-less companion to
// `equip`. Unequip is always legal so a row can always be cleared.
async function applySetEquipped(
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

async function applyAttune(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AttuneOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  if (item.attuned) {
    throw new InvalidInventoryOperationError(`${item.name} is already attuned`);
  }

  // Prerequisite check against the snapshotted columns (5e "requires attunement
  // by a …"). Loads only the identity facts the check needs.
  if (item.attunementPrereqKind) {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: {
        alignment: true,
        raceSelection: { select: { name: true } },
        classEntries: { select: { name: true, subclass: true } },
      },
    });
    const prereq = { kind: item.attunementPrereqKind, value: item.attunementPrereqValue };
    const subject = {
      classEntries: character?.classEntries ?? [],
      raceName: character?.raceSelection?.name ?? null,
      alignment: character?.alignment ?? null,
    };
    if (!meetsAttunementPrereq(prereq, subject)) {
      throw new InvalidInventoryOperationError(
        `${item.name} requires attunement by ${describeAttunementPrereq(prereq)}`,
      );
    }
  }

  // Derived 3-item cap: count currently-attuned rows, reject the 4th with a 409.
  const attunedCount = await tx.inventoryItem.count({ where: { characterId, attuned: true } });
  if (attunedCount >= ATTUNEMENT_LIMIT) {
    throw new AttunementLimitError(
      `Cannot attune to more than ${ATTUNEMENT_LIMIT} items — unattune one first`,
    );
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { attuned: true } });

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "attuned",
    summary: `Attuned to ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { attuned: false },
    after: { attuned: true },
    batchId,
    sessionId,
  });
}

async function applyUnattune(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: UnattuneOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  if (!item.attuned) {
    throw new InvalidInventoryOperationError(`${item.name} is not attuned`);
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { attuned: false } });

  // Unattuning ends any active effect once the item is no longer equipped either.
  if (item.equippedSlot == null) {
    await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `unattuned ${item.name}`);
  }

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "unattuned",
    summary: `Ended attunement to ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { attuned: true },
    after: { attuned: false },
    batchId,
    sessionId,
  });
}

// Spends a use of an item's activatedEffect and seeds its self-buff (#543). Gated
// on the item being equipped/attuned and on remaining uses.
async function applyActivate(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ActivateOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  const cap = activatedCapabilityOf(item);
  if (!cap) {
    throw new InvalidInventoryOperationError(`${item.name} has no activated effect`);
  }
  if (item.equippedSlot == null && !item.attuned) {
    throw new InvalidInventoryOperationError(`${item.name} must be equipped or attuned to activate`);
  }

  // Guard against double-activation FIRST (before the uses check, so an active
  // last-charge item reports "already active", not "no uses remaining"): spending
  // a second use on a buff that's already seeded dedupes the buff in-place (no
  // double-apply) but still wastes the charge.
  const charRow = await tx.character.findUnique({ where: { id: characterId }, select: { activeEffects: true } });
  const cur = normalizeActiveEffectsMutable(charRow?.activeEffects ?? null);
  if (cur.buffs.some((b) => b.key === itemBuffKey(item.id))) {
    throw new InvalidInventoryOperationError(`${item.name} is already active`);
  }

  const maxUses = activatedMaxUses(cap);
  if (maxUses !== null && item.activatedUsesSpent >= maxUses) {
    throw new InvalidInventoryOperationError(`${item.name} has no uses remaining — recharges on a rest`);
  }

  // A charges-costed activation (#555) spends chargeCost from the item's shared
  // pool instead of the per-item activatedUsesSpent counter.
  const pool = cap.resourceKind === "charges" ? chargePoolOf(item.capabilities) : null;
  const chargeCost = cap.resourceKind === "charges" ? Math.max(1, cap.chargeCost) : null;
  if (chargeCost != null) {
    if (!pool) {
      throw new InvalidInventoryOperationError(`${item.name} has no charges pool to spend from`);
    }
    const poolRemaining = Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0));
    if (poolRemaining < chargeCost) {
      throw new InvalidInventoryOperationError(
        `${item.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — ${poolRemaining} remaining`,
      );
    }
  }

  const duration = cap.duration === "untilRest" ? "until-rest" : "while-active";
  const restType = duration === "until-rest" ? (activatedRechargeRest(cap) ?? "long") : undefined;
  await appendActiveBuffInTx(
    tx,
    characterId,
    {
      key: itemBuffKey(item.id),
      target: cap.target,
      modifier: cap.value,
      source: item.name,
      sourceEntryId: itemBuffKey(item.id),
      duration,
      ...(restType ? { restType } : {}),
    },
    batchId,
    sessionId,
  );

  const nextSpent = maxUses !== null ? item.activatedUsesSpent + 1 : item.activatedUsesSpent;
  if (maxUses !== null) {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { activatedUsesSpent: nextSpent } });
  }
  // Charges path: spend the pool row (capabilityUsed before/after makes the
  // revert restore the pool, symmetric with the activatedUsesSpent snapshots).
  // Atomic conditional spend (TOCTOU guard, same as applyCastItemSpellOp): the
  // WHERE re-evaluates under the row's write lock so concurrent spenders can't
  // push `used` past maxCharges; a loser's whole batch rolls back.
  let poolUsedBefore: number | null = null;
  let poolUsedAfter: number | null = null;
  if (pool && chargeCost != null) {
    const spent = await tx.inventoryCapability.updateMany({
      where: { id: pool.row.id, used: { lte: pool.cap.maxCharges - chargeCost } },
      data: { used: { increment: chargeCost } },
    });
    if (spent.count === 0) {
      throw new InvalidInventoryOperationError(
        `${item.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — too few remaining`,
      );
    }
    // Re-read for the event snapshot: under a race the pre-read `pool.row.used` is stale.
    const fresh = await tx.inventoryCapability.findUniqueOrThrow({
      where: { id: pool.row.id },
      select: { used: true },
    });
    poolUsedAfter = fresh.used;
    poolUsedBefore = fresh.used - chargeCost;
  }

  const remaining =
    pool && chargeCost != null
      ? Math.max(0, pool.cap.maxCharges - poolUsedAfter!)
      : maxUses !== null
        ? maxUses - nextSpent
        : null;
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "activated",
    summary:
      pool && remaining !== null
        ? `Activated ${item.name} (${remaining} charge${remaining === 1 ? "" : "s"} left)`
        : remaining !== null
          ? `Activated ${item.name} (${remaining} left)`
          : `Activated ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: {
      activatedUsesSpent: item.activatedUsesSpent,
      ...(pool && chargeCost != null ? { capabilityUsed: { capabilityId: pool.row.id, used: poolUsedBefore } } : {}),
    },
    after: {
      activatedUsesSpent: nextSpent,
      ...(pool && chargeCost != null ? { capabilityUsed: { capabilityId: pool.row.id, used: poolUsedAfter } } : {}),
    },
    data: { itemName: item.name, remaining, ...(chargeCost != null ? { chargesSpent: chargeCost } : {}) },
    batchId,
    sessionId,
  });
}

// Toggles off an active item effect (#543). Clears the buff; the spent use stays
// spent until the recharge rest.
async function applyDeactivate(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: DeactivateOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `deactivated ${item.name}`);

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "deactivated",
    summary: `Deactivated ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    // Non-null empty snapshots: the buff re-applies via the paired effects-event
    // revert, so this inventory event is a no-op on undo (must not read as a create).
    before: {},
    after: {},
    data: { itemName: item.name },
    batchId,
    sessionId,
  });
}

// Resets activatedUsesSpent to 0 for items whose activatedEffect recharges on the
// given rest (#543). perRest(short) recharges on short|long; everything else on
// long only. The seeded buff is cleared separately by the rest's buff sweep.
// Called from the HP rest handler so item uses recharge alongside class resources.
export async function resetActivatedUsesForRestInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  restType: "short" | "long",
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const items = await tx.inventoryItem.findMany({
    where: { characterId, activatedUsesSpent: { gt: 0 } },
    include: { capabilities: true },
  });
  const toReset: { id: string; name: string; previousSpent: number }[] = [];
  for (const item of items) {
    // Type-predicate filter (not a bare cast): an opaque row with kind="activatedEffect"
    // but no activation must not slip through as a malformed ActivatedEffectCapability
    // — activatedRechargeRest would read resourceKind=undefined and spuriously recharge.
    const cap = item.capabilities
      .map(readCapability)
      .find((c): c is ActivatedEffectCapability => c.kind === "activatedEffect" && "activation" in c);
    if (!cap) continue;
    const recharge = activatedRechargeRest(cap);
    if (recharge === null) continue;
    if (restType === "long" || recharge === "short") {
      toReset.push({ id: item.id, name: item.name, previousSpent: item.activatedUsesSpent });
    }
  }
  if (toReset.length === 0) return;

  await tx.inventoryItem.updateMany({
    where: { id: { in: toReset.map((t) => t.id) } },
    data: { activatedUsesSpent: 0 },
  });
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "activatedRecharged",
    summary: `Recharged ${toReset.length} item${toReset.length !== 1 ? "s" : ""} (${restType} rest)`,
    before: { rechargedCount: toReset.length },
    after: null,
    // recharged carries per-item pre-rest spent so undo restores exactly (no entityId).
    data: { restType, recharged: toReset },
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

  // Deleting the row must clear any active-effect buff it seeded (undo re-applies
  // it via the paired effects-event revert, symmetric with the recreated row).
  await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `removed ${item.name}`);
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
    // Full-stack sell deletes the row — clear any seeded buff so it can't leak.
    await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `sold ${item.name}`);
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: item.quantity - quantitySold } });
  }
}

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

  // A rest recharge event has no single entityId — restore each item's pre-rest
  // spent count. Handled before the entityId guard below.
  if (data?.recharged) {
    for (const r of data.recharged) {
      await tx.inventoryItem.updateMany({
        where: { id: r.id },
        data: { activatedUsesSpent: r.previousSpent },
      });
    }
    return;
  }

  // Defensive: nothing to act on without a row id. Checked BEFORE the currency
  // reversal so a malformed event carrying a currencyDelta but no entityId can't
  // mutate currency without a corresponding row action. Well-formed events
  // always have an entityId, so this is a pure no-op for them.
  if (!event.entityId) return;

  // 1. Reverse any currency movement (purchase or sale proceeds).
  const currencyDelta = data?.currencyDelta ?? undefined;
  if (hasNonzeroCurrency(currencyDelta)) {
    const current = await getCharacterCurrency(tx, characterId);
    await setCharacterCurrency(tx, characterId, currencyDebit(current, currencyDelta));
  }

  // 2. Reverse the row mutation, shape-driven.
  if (event.before === null) {
    // Creation (acquire) → delete the created row; detail rows cascade.
    await tx.inventoryItem.delete({ where: { id: event.entityId } });
    return;
  }

  const deletedItem = data?.deletedItem;
  if (deletedItem) {
    // The row was deleted → recreate it, reusing the original id so the
    // soft-reference entityId on other events stays valid.
    let itemId = deletedItem.itemId;
    if (itemId) {
      const catalogItem = await tx.item.findUnique({ where: { id: itemId }, select: { id: true } });
      if (!catalogItem) itemId = null; // catalog row gone → snapshot is self-contained
    }
    // Restore the campaign-item provenance FK too (#381) — without it, undo of a
    // revoke would drop the row from holder/unique-guard queries. Null when the
    // snapshot predates the FK, or the CampaignItem was since deleted (SetNull).
    let campaignItemId = deletedItem.campaignItemId ?? null;
    if (campaignItemId) {
      const campaignItem = await tx.campaignItem.findUnique({ where: { id: campaignItemId }, select: { id: true } });
      if (!campaignItem) campaignItemId = null;
    }
    await tx.inventoryItem.create({
      data: {
        id: event.entityId,
        characterId,
        itemId,
        campaignItemId,
        name: deletedItem.name,
        category: deletedItem.category,
        weight: deletedItem.weight ?? undefined,
        cost: toJsonInput(deletedItem.cost),
        description: deletedItem.description ?? undefined,
        quantity: deletedItem.quantity,
        equippedSlot: deletedItem.equippedSlot ?? null,
        slot: deletedItem.slot ?? null,
        rarity: deletedItem.rarity ?? null,
        attuned: deletedItem.attuned ?? false,
        requiresAttunement: deletedItem.requiresAttunement ?? false,
        attunementPrereqKind: deletedItem.attunementPrereqKind ?? undefined,
        attunementPrereqValue: deletedItem.attunementPrereqValue ?? undefined,
        notes: deletedItem.notes ?? undefined,
        position: deletedItem.position,
        weaponDetail: deletedItem.weaponDetail ? { create: deletedItem.weaponDetail } : undefined,
        armorDetail: deletedItem.armorDetail ? { create: deletedItem.armorDetail } : undefined,
        consumableDetail: deletedItem.consumableDetail
          ? { create: deletedItem.consumableDetail }
          : undefined,
        capabilities:
          deletedItem.capabilities && deletedItem.capabilities.length > 0
            ? { create: deletedItem.capabilities }
            : undefined,
      },
    });
    return;
  }

  // The row still exists → restore the scalar(s) captured in before
  // (quantity for partial sell/adjust, equipped for setEquipped, attuned for
  // attune/unattune, usesRemaining for a charged `use`, activatedUsesSpent for
  // activate, capabilityUsed for a charges-pool spend).
  const before = event.before as {
    quantity?: number;
    equippedSlot?: EquipSlot | null;
    attuned?: boolean;
    activatedUsesSpent?: number;
    usesRemaining?: number;
    capabilityUsed?: { capabilityId: string; used: number };
  };
  const updateData: Prisma.InventoryItemUpdateInput = {};
  if (before.quantity !== undefined) updateData.quantity = before.quantity;
  if (before.equippedSlot !== undefined) updateData.equippedSlot = before.equippedSlot;
  if (before.attuned !== undefined) updateData.attuned = before.attuned;
  if (before.activatedUsesSpent !== undefined) updateData.activatedUsesSpent = before.activatedUsesSpent;
  if (Object.keys(updateData).length > 0) {
    await tx.inventoryItem.update({ where: { id: event.entityId }, data: updateData });
  }
  // usesRemaining lives on the detail row, so restore it separately.
  if (before.usesRemaining !== undefined) {
    await tx.inventoryConsumableDetail.update({
      where: { inventoryItemId: event.entityId },
      data: { usesRemaining: before.usesRemaining },
    });
  }
  // A charges-pool spend (#555) lives on the capability row — restore its counter.
  // updateMany (not update) so a vanished row is a no-op, matching the rest-undo
  // pattern: a delete/undo-delete cycle recreates capabilities with NEW ids, so
  // the old id here may legitimately no longer exist.
  if (before.capabilityUsed !== undefined) {
    await tx.inventoryCapability.updateMany({
      where: { id: before.capabilityUsed.capabilityId },
      data: { used: before.capabilityUsed.used },
    });
  }
}

// Applies a batch of operations atomically — one InventoryTransaction
// batchId groups whatever ledger rows the batch produces (a single inline
// edit is a batch of one; a bulk action is a batch of several). Any thrown
// error rolls back the entire batch, including currency changes.
export async function applyInventoryOperations(
  characterId: string,
  operations: InventoryOperation[]
): Promise<UseResult[]> {
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);
  const useResults: UseResult[] = [];
  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      switch (op.type) {
        case "acquire":
          await applyAcquire(tx, characterId, op, batchId, sessionId);
          break;
        case "adjustQuantity":
          await applyAdjustQuantity(tx, characterId, op, batchId, sessionId);
          break;
        case "use":
          useResults.push(await applyUse(tx, characterId, op, batchId, sessionId));
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
        case "equip":
          await applyEquip(tx, characterId, op, batchId, sessionId);
          break;
        case "setEquipped":
          await applySetEquipped(tx, characterId, op, batchId, sessionId);
          break;
        case "attune":
          await applyAttune(tx, characterId, op, batchId, sessionId);
          break;
        case "unattune":
          await applyUnattune(tx, characterId, op, batchId, sessionId);
          break;
        case "activate":
          await applyActivate(tx, characterId, op, batchId, sessionId);
          break;
        case "deactivate":
          await applyDeactivate(tx, characterId, op, batchId, sessionId);
          break;
      }
    }
  });
  return useResults;
}
