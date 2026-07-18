import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { type InventoryOperation, type UseResult } from "./inventory-types.js";
import { InvalidInventoryOperationError } from "./inventory-currency.js";
import { applyAcquire } from "./inventory-acquire.js";
import { applyUse } from "./inventory-consumable.js";
import { applyAdjustQuantity, applyUpdate, applyRemove, applySell } from "./inventory-quantity.js";
import { applyEquip, applySetEquipped } from "./inventory-placement.js";
import { applyAttune, applyUnattune } from "./inventory-attunement.js";
import { applyActivate, applyDeactivate } from "./inventory-activation.js";

// Domain façade.
//
// inventory.ts is the transaction-pattern reference implementation (CLAUDE.md):
// the transaction entry lives here and re-exports the public surface split
// across the sibling concern modules, so no import site outside lib/inventory/
// changes.

// Public type surface re-exported for import sites outside lib/inventory/. Each
// is consumed externally as a type import; fallow can't trace an `export type
// … from` chain to those consumers, so the whole-line unused-type suppressions
// are the public-API contract, not dead code.

// Detail-input shapes are single-sourced in item-detail-inputs.ts (shared with the catalog seed).
// fallow-ignore-next-line unused-type -- public-API barrel re-export, consumed as a type import elsewhere (see header)
export type { ItemCategoryName, ArmorCategoryName, WeaponDetailInput, ArmorDetailInput, ConsumableDetailInput } from "./item-detail-inputs.js";

// fallow-ignore-next-line unused-type -- public-API barrel re-export, consumed as a type import elsewhere (see header)
export type { Currency } from "./inventory-currency.js";
export {
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
  AttunementLimitError,
  currencyDebit,
  currencyCredit,
} from "./inventory-currency.js";

// fallow-ignore-next-line unused-type -- public-API barrel re-export, consumed as a type import elsewhere (see header)
export type { CustomItemInput, AcquireOperation, AdjustQuantityOperation, UpdateOperation, RemoveOperation, SellOperation, EquipOperation, SetEquippedOperation, AttuneOperation, UnattuneOperation, ActivateOperation, DeactivateOperation, UseOperation, InventoryOperation, UseResult, InventoryItemWithDetails, CatalogItemWithDetails } from "./inventory-types.js";
export { itemBuffKey, inventoryItemDetailInclude, catalogItemDetailInclude } from "./inventory-types.js";

export { isHealingConsumable } from "./inventory-consumable.js";

// fallow-ignore-next-line unused-type -- public-API barrel re-export, consumed as a type import elsewhere (see header)
export type { DeletedInventoryItemSnapshot, AutoEquipCandidate } from "./inventory-snapshot.js";
export {
  snapshotInventoryItemForUndo,
  buildInventoryCreateFromCatalog,
  selectAutoEquip,
  autoEquipSlot,
} from "./inventory-snapshot.js";

export { applyAdjustQuantity } from "./inventory-quantity.js";
export { revertInventoryEvent } from "./inventory-revert.js";

// Applies a batch of operations atomically — one InventoryTransaction
// batchId groups whatever ledger rows the batch produces (a single inline
// edit is a batch of one; a bulk action is a batch of several). Any thrown
// error rolls back the entire batch, including currency changes.
export async function applyInventoryOperations(
  characterId: string,
  operations: InventoryOperation[]
): Promise<UseResult[]> {
  // Appliers re-read what they need internally, so the scaffold row is just an
  // existence check — one extra point-read for item-only ops, buying mid-batch
  // deletion safety.
  const useResults: UseResult[] = [];
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidInventoryOperationError(`Character not found: ${id}`),
    // Flat, exhaustive, type-narrowed op dispatch: high cyclomatic (one branch per
    // op type) but trivially readable (cognitive 1). A dispatch map would trade the
    // per-case type narrowing for casts and read worse, so this is adjudicated as an
    // idiomatic switch rather than refactored (#690 opportunistic burn-down).
    // fallow-ignore-next-line complexity -- idiomatic type-narrowed op switch (cognitive 1); a dispatch map would read worse (#690)
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      switch (op.type) {
        case "acquire":
          await applyAcquire(tx, id, op, batchId, sessionId);
          break;
        case "adjustQuantity":
          await applyAdjustQuantity(tx, id, op, batchId, sessionId);
          break;
        case "use":
          useResults.push(await applyUse(tx, id, op, batchId, sessionId));
          break;
        case "update":
          await applyUpdate(tx, id, op);
          break;
        case "remove":
          await applyRemove(tx, id, op, batchId, sessionId);
          break;
        case "sell":
          await applySell(tx, id, op, batchId, sessionId);
          break;
        case "equip":
          await applyEquip(tx, id, op, batchId, sessionId);
          break;
        case "setEquipped":
          await applySetEquipped(tx, id, op, batchId, sessionId);
          break;
        case "attune":
          await applyAttune(tx, id, op, batchId, sessionId);
          break;
        case "unattune":
          await applyUnattune(tx, id, op, batchId, sessionId);
          break;
        case "activate":
          await applyActivate(tx, id, op, batchId, sessionId);
          break;
        case "deactivate":
          await applyDeactivate(tx, id, op, batchId, sessionId);
          break;
      }
    },
  });
  return useResults;
}
