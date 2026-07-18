import { Prisma, type EquipSlot } from "@/generated/prisma/client.js";
import type {
  ItemCategoryName,
  WeaponDetailInput,
  ArmorDetailInput,
  ConsumableDetailInput,
} from "./item-detail-inputs.js";
import { type Currency, InvalidInventoryOperationError } from "./inventory-currency.js";

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
  return item;
}

export async function nextPosition(tx: Prisma.TransactionClient, characterId: string): Promise<number> {
  return tx.inventoryItem.count({ where: { characterId } });
}
