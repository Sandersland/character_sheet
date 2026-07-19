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

// AdjustQuantityOperation is the only concern-module type still consumed outside
// lib/inventory/ (routes/character/actions.ts casts a synthetic op to it). The
// rest of the split's public surface is the value exports below; the other op /
// detail-input / snapshot interfaces stay concern-module-local — the inventory
// route types its ops via z.infer, not the exported interfaces (#1039).
export type { AdjustQuantityOperation } from "./inventory-types.js";

export {
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
  AttunementLimitError,
  currencyDebit,
  currencyCredit,
} from "./inventory-currency.js";

export { itemBuffKey, inventoryItemDetailInclude, catalogItemDetailInclude } from "./inventory-types.js";

export { isHealingConsumable } from "./inventory-consumable.js";

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
