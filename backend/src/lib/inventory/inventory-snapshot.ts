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

function normalizeWeaponGripProperties(input: WeaponDetailInput) {
  return {
    finesse: input.finesse ?? false,
    light: input.light ?? false,
    heavy: input.heavy ?? false,
    twoHanded: input.twoHanded ?? false,
  };
}

function normalizeWeaponEngagementProperties(input: WeaponDetailInput) {
  return {
    reach: input.reach ?? false,
    thrown: input.thrown ?? false,
    ammunition: input.ammunition ?? false,
  };
}

// Nullable so homebrew weapons can omit classification.
function normalizeWeaponClassification(input: WeaponDetailInput) {
  return {
    rangeNormal: input.rangeNormal ?? null,
    rangeLong: input.rangeLong ?? null,
    weaponClass: input.weaponClass ?? null,
    weaponRange: input.weaponRange ?? null,
  };
}

// Fills in every optional field's default explicitly — Prisma's nested `create` input wants concrete values, not `undefined`, for fields the schema defaults or allows null.
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

// The live-DB counterpart to itemDetailCreateFields, which does the same thing from a seed-time literal instead of a DB read.
export function snapshotItemDetail(item: CatalogItemWithDetails) {
  return snapshotDetailCreate(item);
}

// When an op DELETES a row, `before`/`after` alone can't reconstruct it, so a self-contained snapshot is stashed under `data.deletedItem` instead (`data` is never diffed, unlike `before`/`after` which feed diffToFields). revertInventoryEvent recreates the row from this snapshot, reusing the original id.
// #1649: the frozen half is captured verbatim as the already-persisted `snapshot` blob; `capabilityUses` (runtime `used` counters, keyed by `capabilities[].key`) is the only piece needing its own array, since it lives in a separate table.
export interface DeletedInventoryItemSnapshot {
  id: string;
  itemId: string | null;
  // #1646: LEGACY, read-only — the pre-merge name for the same provenance FK, still carried by append-only audit blobs written before the merge; resolveSnapshotRefs falls back to it. No writer sets it any more.
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
  weaponBonded: boolean;
  notes: string | null;
  position: number;
  usesRemaining: number | null;
  snapshot: Prisma.InputJsonValue;
  capabilityUses: { capabilityKey: string; used: number }[];
}

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
    weaponBonded: item.weaponBonded,
    notes: item.notes,
    position: item.position,
    usesRemaining: item.usesRemaining,
    snapshot: item.snapshot as Prisma.InputJsonValue,
    // `used` is included, unlike snapshotCampaignItemCapabilityCreates's award path: undo-of-delete restores the row verbatim, spend state included.
    capabilityUses: item.capabilities.map((c) => ({ capabilityKey: c.id, used: c.used })),
  };
}

// Used to create starting-equipment rows atomically inside prisma.character.create, without going through applyInventoryOperations — starting gear is a character's genesis state, not an economic event.
// #1649: `weaponDetail`/`armorDetail` on the RETURNED object are NOT persisted columns — carried here only so selectAutoEquip/autoEquipSlot can read them before the auto-equip pass assigns equippedSlot; stripInventoryCreateForWrite drops them before the actual write.
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
    // #1648: same freshCopy value the nested consumableDetail create below carries.
    usesRemaining: detail.consumableDetail?.create.usesRemaining ?? null,
    // rarity/requiresAttunement/attunementPrereqKind/Value are NOT snapshotted from the catalog item: this create doesn't set those columns either, so the snapshot must agree with what the row actually persists.
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

// #1649: weaponDetail/armorDetail aren't valid InventoryItem create fields.
export function stripInventoryCreateForWrite<T extends { weaponDetail: unknown; armorDetail: unknown }>(
  create: T,
): Omit<T, "weaponDetail" | "armorDetail"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude these two keys from `rest`
  const { weaponDetail, armorDetail, ...rest } = create;
  return rest;
}

// Kept structural, not tied to buildInventoryCreateFromCatalog's exact return type, so the rule stays unit-testable from a hand-written literal with no DB.
export interface AutoEquipCandidate {
  category: ItemCategory;
  position: number;
  weaponDetail?: { create: { twoHanded?: boolean | null } } | undefined;
  armorDetail?: { create: { armorCategory: ArmorCategory } } | undefined;
}

// Mirrors the off-hand/two-handed constraints the read path derives (characters.ts): primary weapon (first by position) is always equipped; if it's two-handed, no shield and no second weapon; otherwise a shield also equips; body armor equips regardless of weapon grip.
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

// #565: selectAutoEquip only ever picks one weapon, one shield, and one body armor, so this mapping is unambiguous.
export function autoEquipSlot(item: AutoEquipCandidate): EquipSlot {
  if (item.category === "weapon") return "MAIN_HAND";
  if (item.armorDetail?.create.armorCategory === "shield") return "OFF_HAND";
  return "BODY";
}
