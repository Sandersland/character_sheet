import { Prisma, type EquipSlot, type ItemRarity } from "@/generated/prisma/client.js";
import { type AttunementPrereqKind } from "./capabilities.js";
import { snapshotDetailCreate } from "./detail-snapshot.js";
import type {
  ItemCategory,
  ArmorCategory,
  WeaponDetailInput,
  ArmorDetailInput,
  ConsumableDetailInput,
} from "./item-detail-inputs.js";
import { type Currency, asCurrency, toJsonInput } from "./inventory-currency.js";
import type { InventoryItemWithDetails, CatalogItemWithDetails } from "./inventory-types.js";
import { buildInventorySnapshot } from "./inventory-snapshot-build.js";

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

// Undo snapshot.
//
// When an op DELETES an InventoryItem row (full sell, remove, adjust-to-zero)
// the row is gone, so `before`/`after` alone can't reconstruct it on undo. We
// stash a self-contained snapshot under `data.deletedItem` (NOT `before` —
// `before`/`after` feed diffToFields and would spray spurious field-diff rows;
// `data` is never diffed). On revert, revertInventoryEvent recreates the row
// from this snapshot reusing the original id.
//
// #1649 simplified this: the frozen half (weapon/armor/consumable/
// capabilities) is captured verbatim as the already-persisted `snapshot`
// blob rather than re-derived field by field from four detail tables that no
// longer exist — recreate just writes it straight back. `capabilityUses`
// (runtime `used` counters, keyed by the snapshot's stable `capabilities[].key`)
// is the only piece that still needs its own array, since it lives in a
// separate table from the snapshot.
export interface DeletedInventoryItemSnapshot {
  id: string;
  itemId: string | null;
  // LEGACY, read-only (#1646): the pre-merge name for the same provenance FK.
  // Audit blobs are append-only, so pre-merge snapshots still carry this key
  // instead of itemId; resolveSnapshotRefs falls back to it on undo. No writer
  // sets it any more — snapshotInventoryItemForUndo below only writes itemId.
  campaignItemId?: string | null;
  name: string;
  category: ItemCategory;
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
  usesRemaining: number | null;
  snapshot: Prisma.InputJsonValue;
  capabilityUses: { capabilityKey: string; used: number }[];
}

// Serializes an already-fetched InventoryItemWithDetails into the
// `data.deletedItem` snapshot, reading from an InventoryItem (live row) rather
// than a catalog Item and keeping the scalar item columns alongside the
// already-persisted frozen blob.
export function snapshotInventoryItemForUndo(item: InventoryItemWithDetails): DeletedInventoryItemSnapshot {
  return {
    id: item.id,
    itemId: item.itemId,
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
    usesRemaining: item.usesRemaining,
    snapshot: item.snapshot as Prisma.InputJsonValue,
    // `used` included (unlike snapshotCampaignItemCapabilityCreates's award
    // path): undo-of-delete restores the row verbatim, spend state included.
    capabilityUses: item.capabilities.map((c) => ({ capabilityKey: c.id, used: c.used })),
  };
}

// Builds the nested-create payload for an InventoryItem from a catalog Item
// that has already been fetched with catalogItemDetailInclude. Used by
// charactersRouter to create starting-equipment rows atomically inside
// prisma.character.create, without going through applyInventoryOperations
// (which would write ledger rows — starting gear is a character's genesis
// state, not an economic event; same reasoning as prisma/seed.ts).
//
// `weaponDetail`/`armorDetail` on the RETURNED object are NOT persisted
// columns (#1649 dropped those tables) — they're carried here only so
// selectAutoEquip/autoEquipSlot can read them before the auto-equip pass
// assigns equippedSlot; stripInventoryCreateForWrite below drops them from
// the actual `inventoryItems: { create: [...] }` payload.
export function buildInventoryCreateFromCatalog(
  item: CatalogItemWithDetails,
  opts: { quantity: number; position: number }
) {
  const detail = snapshotItemDetail(item);
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
    // Promoted out of InventoryConsumableDetail (#1648) — same freshCopy value
    // the nested consumableDetail create below carries.
    usesRemaining: detail.consumableDetail?.create.usesRemaining ?? null,
    // catalogItemDetailInclude doesn't fetch capabilities (starting gear is
    // catalog-only content, never a capability-bearing DM award), so this is
    // always built with capabilities: []. rarity/requiresAttunement/
    // attunementPrereqKind/Value are NOT snapshotted from the catalog item
    // here (pre-existing behaviour, unchanged by #1648): this create doesn't
    // set those columns either, so the snapshot must agree with what the row
    // actually persists, not with the catalog's values.
    snapshot: buildInventorySnapshot({
      name: item.name,
      category: item.category,
      weight: item.weight ?? null,
      cost: asCurrency(item.cost),
      description: item.description ?? null,
      slot: item.slot,
      rarity: null,
      requiresAttunement: false,
      attunementPrereqKind: null,
      attunementPrereqValue: null,
      weaponDetail: detail.weaponDetail?.create ?? null,
      armorDetail: detail.armorDetail?.create ?? null,
      consumableDetail: detail.consumableDetail?.create ?? null,
      capabilities: [],
    }) as unknown as Prisma.InputJsonValue,
    weaponDetail: detail.weaponDetail,
    armorDetail: detail.armorDetail,
  };
}

// Drops the auto-equip-only `weaponDetail`/`armorDetail` fields
// buildInventoryCreateFromCatalog's result carries (see its comment) before
// the array reaches `inventoryItems: { create: [...] }` — those keys aren't
// valid InventoryItem create fields since #1649.
export function stripInventoryCreateForWrite<T extends { weaponDetail: unknown; armorDetail: unknown }>(
  create: T,
): Omit<T, "weaponDetail" | "armorDetail"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude these two keys from `rest`
  const { weaponDetail, armorDetail, ...rest } = create;
  return rest;
}

// Minimal shape selectAutoEquip needs to decide what to equip — a subset of
// what buildInventoryCreateFromCatalog returns. Kept structural (not tied to
// that function's exact return type) so the rule stays unit-testable from a
// hand-written literal with no DB.
export interface AutoEquipCandidate {
  category: ItemCategory;
  position: number;
  weaponDetail?: { create: { twoHanded?: boolean | null } } | undefined;
  armorDetail?: { create: { armorCategory: ArmorCategory } } | undefined;
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
