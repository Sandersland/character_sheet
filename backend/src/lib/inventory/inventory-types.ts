import { Prisma, type EquipSlot } from "@/generated/prisma/client.js";
import type {
  ItemCategory,
  WeaponDetailInput,
  ArmorDetailInput,
  ConsumableDetailInput,
} from "./item-detail-inputs.js";
import { type Currency, InvalidInventoryOperationError } from "./inventory-currency.js";
import { capabilityColumnsFromSnapshot, type CapabilityColumns } from "./capabilities.js";
import { readInventorySnapshot } from "./inventory-snapshot-read.js";
import type { ArmorDetailFields, ConsumableDetailFields, WeaponDetailFields } from "./detail-snapshot.js";

export interface CustomItemInput {
  name: string;
  category: ItemCategory;
  weight?: number;
  cost?: Currency;
  description?: string;
  // Paper-doll slot for wearable custom gear (#565); null/omitted = bag-only.
  slot?: EquipSlot;
  weapon?: WeaponDetailInput;
  armor?: ArmorDetailInput;
  consumable?: ConsumableDetailInput;
}

// Exactly one of itemId/custom. currencyDelta is the "Add vs Buy" merge — ledger type depends on whether a nonzero amount was charged.
export interface AcquireOperation {
  type: "acquire";
  itemId?: string;
  custom?: CustomItemInput;
  quantity?: number;
  equipped?: boolean;
  notes?: string;
  currencyDelta?: Currency;
}

// Reaching 0 deletes the row. Ledger type is derived from the sign: gaining counts as "acquired", losing counts as "consumed".
export interface AdjustQuantityOperation {
  type: "adjustQuantity";
  inventoryItemId: string;
  delta: number;
}

// Cosmetic edit — never logged. weapon/armor/consumable overrides are partial. Placement is NOT edited here — equip/unequip go through the `equip`/`setEquipped` ops so they're logged.
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

// Deletes a row outright, regardless of quantity — distinct from adjustQuantity.
export interface RemoveOperation {
  type: "remove";
  inventoryItemId: string;
}

export interface SellOperation {
  type: "sell";
  inventoryItemId: string;
  quantity?: number;
  currencyDelta: Currency;
}

// #565: logged + undoable. Rejects a full slot — no silent displacement.
export interface EquipOperation {
  type: "equip";
  inventoryItemId: string;
  slot: EquipSlot;
}

// Unlike `update`, this IS logged and undoable. equip=true delegates to the same placement rules as `equip`, auto-picking the first free compatible slot.
export interface SetEquippedOperation {
  type: "setEquipped";
  inventoryItemId: string;
  equipped: boolean;
}

// #545: enforces the derived 3-item cap (409 on the 4th) and the snapshotted attunement prerequisite.
export interface AttuneOperation {
  type: "attune";
  inventoryItemId: string;
}

// Always legal so a stuck row can clear.
export interface UnattuneOperation {
  type: "unattune";
  inventoryItemId: string;
}

// #543: spends a use and seeds the while-active/until-rest self-buff.
export interface ActivateOperation {
  type: "activate";
  inventoryItemId: string;
}

// The spent use is NOT restored — it recharges on the matching rest.
export interface DeactivateOperation {
  type: "deactivate";
  inventoryItemId: string;
}

// #121: stackable (maxUses null) decrements quantity; charged (maxUses set) decrements usesRemaining. Auto-applies ONLY healing.
export interface UseOperation {
  type: "use";
  inventoryItemId: string;
  // When present, length must equal effectDiceCount and each be in 1..effectDiceFaces; when absent the server rolls.
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

// `applied` is "heal" only when the effect auto-applied.
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

// #1649: the mirror detail tables are gone — `capabilityUses` is the only relation left to join; weapon/armor/consumable/capabilities are reconstructed from `snapshot` by resolveInventoryItem below.
export const inventoryItemDetailInclude = {
  capabilityUses: true,
} satisfies Prisma.InventoryItemInclude;

type RawInventoryItemRow = Prisma.InventoryItemGetPayload<{ include: typeof inventoryItemDetailInclude }>;

// #1649: reconstructs the pre-#1649 shape every consumer was already written against (weaponDetail/armorDetail/consumableDetail/capabilities as if still live-joined relations) — what let #1649 flip the read source without touching their internals.
export type InventoryItemWithDetails = Omit<RawInventoryItemRow, "capabilityUses"> & {
  weaponDetail: WeaponDetailFields | null;
  armorDetail: ArmorDetailFields | null;
  // #1648: usesRemaining is glued back on from the column — never part of the frozen snapshot, but every existing reader expects it here.
  consumableDetail: (ConsumableDetailFields & { usesRemaining: number | null }) | null;
  capabilities: (CapabilityColumns & { id: string; used: number })[];
};

// The `as WeaponDetailFields`-style casts below are type-only: zod's `.nullish()` types every optional snapshot field as `T | null | undefined`, but buildInventorySnapshot always writes an explicit value or `null`, never omits a key — so a parsed snapshot's fields are never actually `undefined` at runtime.
export function resolveInventoryItem(row: RawInventoryItemRow): InventoryItemWithDetails {
  const snapshot = readInventorySnapshot(row);
  const usedByKey = new Map(row.capabilityUses.map((u) => [u.capabilityKey, u.used]));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude capabilityUses from `rest`, which InventoryItemWithDetails doesn't carry
  const { capabilityUses, ...rest } = row;
  return {
    ...rest,
    weaponDetail: (snapshot.weapon ?? null) as WeaponDetailFields | null,
    armorDetail: (snapshot.armor ?? null) as ArmorDetailFields | null,
    consumableDetail: snapshot.consumable
      ? ({ ...snapshot.consumable, usesRemaining: row.usesRemaining } as ConsumableDetailFields)
      : null,
    capabilities: snapshot.capabilities.map((c) => capabilityColumnsFromSnapshot(c, usedByKey.get(c.key) ?? 0)),
  };
}

// Exported so charactersRouter can build starting-equipment inventory rows at character creation time.
export const catalogItemDetailInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
} satisfies Prisma.ItemInclude;

export type CatalogItemWithDetails = Prisma.ItemGetPayload<{ include: typeof catalogItemDetailInclude }>;

// The one place ownership is checked, so a stray inventoryItemId can't touch another character's inventory.
export async function getOwnedInventoryItem(
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
  return resolveInventoryItem(item);
}

export async function nextPosition(tx: Prisma.TransactionClient, characterId: string): Promise<number> {
  return tx.inventoryItem.count({ where: { characterId } });
}
