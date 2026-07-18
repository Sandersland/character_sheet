import { Prisma, type EquipSlot, type ItemRarity } from "@/generated/prisma/client.js";
import { type AttunementPrereqKind } from "./capabilities.js";
import {
  armorDetailFields,
  consumableDetailFields,
  snapshotDetailCreate,
  weaponDetailFields,
} from "./detail-snapshot.js";
import type {
  ItemCategoryName,
  ArmorCategoryName,
  WeaponDetailInput,
  ArmorDetailInput,
  ConsumableDetailInput,
} from "./item-detail-inputs.js";
import { type Currency, asCurrency, toJsonInput } from "./inventory-currency.js";
import type { InventoryItemWithDetails, CatalogItemWithDetails } from "./inventory-types.js";

// Damage-roll fields of a weapon detail block, defaulted the same way as
// their sibling groups below (see normalizeWeaponDetail).
function normalizeWeaponDamageProfile(input: WeaponDetailInput) {
  return {
    damageDiceCount: input.damageDiceCount,
    damageDiceFaces: input.damageDiceFaces,
    damageModifier: input.damageModifier ?? 0,
    damageType: input.damageType,
    versatileDiceCount: input.versatileDiceCount ?? null,
    versatileDiceFaces: input.versatileDiceFaces ?? null,
  };
}

// Grip-related boolean properties (how the weapon is wielded).
function normalizeWeaponGripProperties(input: WeaponDetailInput) {
  return {
    finesse: input.finesse ?? false,
    light: input.light ?? false,
    heavy: input.heavy ?? false,
    twoHanded: input.twoHanded ?? false,
  };
}

// Engagement-related boolean properties (how the weapon reaches its target).
function normalizeWeaponEngagementProperties(input: WeaponDetailInput) {
  return {
    reach: input.reach ?? false,
    thrown: input.thrown ?? false,
    ammunition: input.ammunition ?? false,
  };
}

// Range + open-pick classification fields (see WeaponClass/WeaponRange in
// schema.prisma — nullable so homebrew weapons can omit classification).
function normalizeWeaponClassification(input: WeaponDetailInput) {
  return {
    rangeNormal: input.rangeNormal ?? null,
    rangeLong: input.rangeLong ?? null,
    weaponClass: input.weaponClass ?? null,
    weaponRange: input.weaponRange ?? null,
  };
}

// Fills in every optional field's default explicitly — a custom item's
// detail block comes from a Zod-validated but otherwise free-form object
// (`WeaponDetailInput` etc., all-optional past the required fields), and
// Prisma's nested `create` input wants concrete values, not `undefined`,
// for fields the schema defaults (damageModifier, finesse, ...) or allows
// null (versatileDiceCount, rangeNormal, ...).
export function normalizeWeaponDetail(input: WeaponDetailInput) {
  return {
    ...normalizeWeaponDamageProfile(input),
    ...normalizeWeaponGripProperties(input),
    ...normalizeWeaponEngagementProperties(input),
    ...normalizeWeaponClassification(input),
  };
}

export function normalizeArmorDetail(input: ArmorDetailInput) {
  return {
    armorCategory: input.armorCategory,
    baseArmorClass: input.baseArmorClass,
    dexModifierApplies: input.dexModifierApplies ?? false,
    dexModifierMax: input.dexModifierMax ?? null,
    stealthDisadvantage: input.stealthDisadvantage ?? false,
    strengthRequirement: input.strengthRequirement ?? null,
  };
}

export function normalizeConsumableDetail(input: ConsumableDetailInput) {
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
export function snapshotItemDetail(item: CatalogItemWithDetails) {
  return snapshotDetailCreate(item);
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
    // fallow-ignore-next-line code-duplication -- snapshot mirrors the persisted capability shape field-for-field on purpose
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
// charactersRouter to create starting-equipment rows atomically inside
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
