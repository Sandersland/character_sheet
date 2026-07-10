import { randomUUID } from "node:crypto";

import { Prisma, type EquipSlot, type ItemRarity } from "@/generated/prisma/client.js";
import {
  activatedMaxUses,
  activatedRechargeRest,
  type AttunementPrereqKind,
  chargePoolOf,
  type ChargesCapability,
  describeAttunementPrereq,
  meetsAttunementPrereq,
  readCapability,
  type ActivatedEffectCapability,
} from "./capabilities.js";
import {
  appendActiveBuffInTx,
  clearBuffByKeyInTx,
  clearBuffsByTargetInTx,
  normalizeActiveEffectsMutable,
} from "./active-effects.js";
import {
  armorDetailFields,
  consumableDetailFields,
  snapshotDetailCreate,
  weaponDetailFields,
} from "./detail-snapshot.js";
import { rollDie } from "./dice.js";
import { logEvent } from "./events.js";
import { applyHealInTx } from "./hitpoints.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";

// 5e: a character can attune to at most 3 magic items (DMG p. 138). Derived
// (counted from live rows), never persisted.
const ATTUNEMENT_LIMIT = 3;

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
  return snapshotDetailCreate(item);
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
function allowedSlotsForItem(item: PlaceableItem): EquipSlot[] {
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
  // Donning body armor true-ends Mage Armor (an "acUnarmoredBase" buff) per RAW —
  // "The spell ends if the target dons armor" — so it must be recast (#363).
  // A shield (OFF_HAND) doesn't count; concentration AC buffs are unaffected.
  if (slot === "BODY") {
    await clearBuffsByTargetInTx(tx, characterId, "acUnarmoredBase", batchId, sessionId, `donned ${item.name}`);
  }
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
    weaponDetail: item.weaponDetail ? weaponDetailFields(item.weaponDetail) : null,
    armorDetail: item.armorDetail ? armorDetailFields(item.armorDetail) : null,
    consumableDetail: item.consumableDetail ? consumableDetailFields(item.consumableDetail) : null,
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

async function applyAcquire(
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

type ConsumableDetail = InventoryItemWithDetails["consumableDetail"];

// A consumable's effect-dice metadata (0 count/faces ⇒ no roll).
function consumableEffectDice(detail: ConsumableDetail): { diceCount: number; faces: number; modifier: number } {
  return {
    diceCount: detail?.effectDiceCount ?? 0,
    faces: detail?.effectDiceFaces ?? 0,
    modifier: detail?.effectModifier ?? 0,
  };
}

// Rolls a consumable's effect dice — client-supplied for the 3D animation, else
// server-rolled — validating any supplied rolls. total is null when it has no dice.
function rollConsumableEffect(
  op: UseOperation,
  item: InventoryItemWithDetails,
  detail: ConsumableDetail,
): { rolls: number[]; modifier: number; total: number | null } {
  const { diceCount, faces, modifier } = consumableEffectDice(detail);
  if (diceCount <= 0 || faces <= 0) return { rolls: [], modifier, total: null };
  let rolls: number[];
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
  return { rolls, modifier, total: rolls.reduce((sum, r) => sum + r, 0) + modifier };
}

// The event before/after snapshots + row-effect of consuming one use. Decrements
// usesRemaining (charged) or quantity (stackable); throws when nothing is left.
interface UseDecrement {
  before: Record<string, unknown>;
  after: Record<string, unknown> | null;
  deletedItem: DeletedInventoryItemSnapshot | undefined;
  remainingUses: number | null;
  remainingQty: number | null;
}

function computeUseDecrement(
  item: InventoryItemWithDetails,
  detail: ConsumableDetail,
  charged: boolean,
): UseDecrement {
  if (charged) {
    const current = detail?.usesRemaining ?? 0;
    if (current <= 0) {
      throw new InvalidInventoryOperationError(`${item.name} has no uses remaining`);
    }
    const remainingUses = current - 1;
    return {
      before: { usesRemaining: current },
      after: { usesRemaining: remainingUses },
      deletedItem: undefined,
      remainingUses,
      remainingQty: null,
    };
  }
  if (item.quantity <= 0) {
    throw new InvalidInventoryOperationError(`${item.name} has none left to use`);
  }
  const remainingQty = item.quantity - 1;
  return {
    before: { quantity: item.quantity },
    after: remainingQty === 0 ? null : { quantity: remainingQty },
    deletedItem: remainingQty === 0 ? snapshotInventoryItemForUndo(item) : undefined,
    remainingUses: null,
    remainingQty,
  };
}

// Writes the computed decrement to the row: charged updates usesRemaining, a
// depleted stackable deletes the row, otherwise the quantity drops by one.
async function persistUseDecrement(
  tx: Prisma.TransactionClient,
  item: InventoryItemWithDetails,
  charged: boolean,
  remainingUses: number | null,
  remainingQty: number | null,
) {
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
}

// Auto-applies a consumable's healing only — non-heal effects are rolled and
// recorded but never applied server-side (#121). Returns "heal" when it applied.
async function applyConsumableHeal(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  detail: ConsumableDetail,
  total: number | null,
  batchId: string,
  sessionId: string | null,
): Promise<"heal" | null> {
  if (!isHealingConsumable(detail?.effectDescription) || total === null || total <= 0) return null;
  await applyHealInTx(tx, characterId, total, batchId, sessionId, { source: item.name });
  return "heal";
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

  const { rolls, modifier, total } = rollConsumableEffect(op, item, detail);
  const { before, after, deletedItem, remainingUses, remainingQty } = computeUseDecrement(item, detail, charged);
  const applied = await applyConsumableHeal(tx, characterId, item, detail, total, batchId, sessionId);

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

  await persistUseDecrement(tx, item, charged, remainingUses, remainingQty);

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

// The charges pool + cost for a #555 charges-costed activation, sitting on the
// item's shared capability rows; typed off the live include so the pool row
// carries its runtime `used` counter.
type ChargePool = { cap: ChargesCapability; row: InventoryItemWithDetails["capabilities"][number] };

// Throws if the item can't currently activate: not equipped/attuned, already
// active, or out of uses. The already-active guard comes FIRST (before the uses
// check) so an active last-charge item reports "already active", not "no uses".
// A second activation of a seeded buff would dedupe in-place but still waste a charge.
async function assertActivatable(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  cap: ActivatedEffectCapability,
) {
  if (item.equippedSlot == null && !item.attuned) {
    throw new InvalidInventoryOperationError(`${item.name} must be equipped or attuned to activate`);
  }
  const charRow = await tx.character.findUnique({ where: { id: characterId }, select: { activeEffects: true } });
  const cur = normalizeActiveEffectsMutable(charRow?.activeEffects ?? null);
  if (cur.buffs.some((b) => b.key === itemBuffKey(item.id))) {
    throw new InvalidInventoryOperationError(`${item.name} is already active`);
  }
  const maxUses = activatedMaxUses(cap);
  if (maxUses !== null && item.activatedUsesSpent >= maxUses) {
    throw new InvalidInventoryOperationError(`${item.name} has no uses remaining — recharges on a rest`);
  }
}

// The pool + cost for a charges-costed activation (#555), or nulls when the
// activation spends the per-item use counter instead. Throws when the pool is
// missing or holds fewer charges than the cost.
function resolveActivationCharges(
  item: InventoryItemWithDetails,
  cap: ActivatedEffectCapability,
): { pool: ChargePool | null; chargeCost: number | null } {
  if (cap.resourceKind !== "charges") return { pool: null, chargeCost: null };
  const pool = chargePoolOf(item.capabilities);
  const chargeCost = Math.max(1, cap.chargeCost);
  if (!pool) {
    throw new InvalidInventoryOperationError(`${item.name} has no charges pool to spend from`);
  }
  const poolRemaining = Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0));
  if (poolRemaining < chargeCost) {
    throw new InvalidInventoryOperationError(
      `${item.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — ${poolRemaining} remaining`,
    );
  }
  return { pool, chargeCost };
}

// Atomically spends chargeCost from the pool row (TOCTOU guard, same as
// applyCastItemSpellOp): the WHERE re-evaluates under the row's write lock so
// concurrent spenders can't push `used` past maxCharges; a loser's batch rolls
// back. Returns the pre/post `used` counter for the event snapshot.
async function spendActivationCharges(
  tx: Prisma.TransactionClient,
  item: InventoryItemWithDetails,
  pool: ChargePool,
  chargeCost: number,
): Promise<{ before: number; after: number }> {
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
  return { after: fresh.used, before: fresh.used - chargeCost };
}

// Seeds the item's while-active / until-rest self-buff (#543).
async function seedActivationBuff(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  cap: ActivatedEffectCapability,
  batchId: string,
  sessionId: string | null,
) {
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
}

// Uses left to report after an activation: pool charges remaining when
// charges-costed, else the per-item use budget, else null (unlimited).
function activationRemaining(
  pool: ChargePool | null,
  chargeCost: number | null,
  poolUsedAfter: number | null,
  maxUses: number | null,
  nextSpent: number,
): number | null {
  if (pool && chargeCost != null) return Math.max(0, pool.cap.maxCharges - poolUsedAfter!);
  return maxUses !== null ? maxUses - nextSpent : null;
}

// Event summary for an activation: names the charges/uses left, or neither.
function activateSummary(itemName: string, hasPool: boolean, remaining: number | null): string {
  if (hasPool && remaining !== null) {
    return `Activated ${itemName} (${remaining} charge${remaining === 1 ? "" : "s"} left)`;
  }
  if (remaining !== null) return `Activated ${itemName} (${remaining} left)`;
  return `Activated ${itemName}`;
}

// The activatedUsesSpent (+ optional charges-pool) snapshot for an activate
// event's before/after — capabilityUsed only when the spend came from a pool.
function activationSnapshot(
  spent: number,
  pool: ChargePool | null,
  chargeCost: number | null,
  poolUsed: number | null,
): Record<string, unknown> {
  return {
    activatedUsesSpent: spent,
    ...(pool && chargeCost != null ? { capabilityUsed: { capabilityId: pool.row.id, used: poolUsed } } : {}),
  };
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
  await assertActivatable(tx, characterId, item, cap);
  const { pool, chargeCost } = resolveActivationCharges(item, cap);

  await seedActivationBuff(tx, characterId, item, cap, batchId, sessionId);

  const maxUses = activatedMaxUses(cap);
  const nextSpent = maxUses !== null ? item.activatedUsesSpent + 1 : item.activatedUsesSpent;
  if (maxUses !== null) {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { activatedUsesSpent: nextSpent } });
  }
  // Charges path: spend the pool row (capabilityUsed before/after makes the
  // revert restore the pool, symmetric with the activatedUsesSpent snapshots).
  let poolUsedBefore: number | null = null;
  let poolUsedAfter: number | null = null;
  if (pool && chargeCost != null) {
    const { before, after } = await spendActivationCharges(tx, item, pool, chargeCost);
    poolUsedBefore = before;
    poolUsedAfter = after;
  }

  const remaining = activationRemaining(pool, chargeCost, poolUsedAfter, maxUses, nextSpent);
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "activated",
    summary: activateSummary(item.name, pool != null, remaining),
    entityType: "InventoryItem",
    entityId: item.id,
    before: activationSnapshot(item.activatedUsesSpent, pool, chargeCost, poolUsedBefore),
    after: activationSnapshot(nextSpent, pool, chargeCost, poolUsedAfter),
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
