/**
 * Assembles the `sell` operation array for the inventory bulk-sell flow
 * (issue #103) — pure, JSX-free, unit-tested in isolation. The orchestrator
 * (`InventoryList`) posts the result through `applyInventoryTransactions`,
 * which applies the whole batch atomically.
 *
 * Each line carries its own `quantity` (a partial sale leaves the remainder in
 * inventory) and `currencyDelta` (the player-typed amount received), so the op
 * is explicit regardless of any later catalog drift.
 */

import { splitLumpSum, toCopper } from "@/lib/currency";
import type { Currency, InventoryOperation } from "@/types/character";

/** One line the player chose to sell — `quantity` may be a partial slice of the stack. */
export interface SellLine {
  inventoryItemId: string;
  quantity: number;
}

// Prefill: half the per-unit catalog value (rounded down) × quantity, kept in gp/sp/cp (no platinum roll-up) so a 15 gp default reads "15 gp".
export function defaultSellPrice(cost: Currency | undefined, quantity: number): Currency {
  let remaining = Math.floor(toCopper(cost ?? ZERO_CURRENCY) / 2) * Math.max(0, quantity);
  const gp = Math.floor(remaining / 100);
  remaining -= gp * 100;
  const sp = Math.floor(remaining / 10);
  remaining -= sp * 10;
  return { cp: remaining, sp, gp, pp: 0 };
}

/**
 * Pricing strategy for the batch:
 *  - `perItem`  — an explicit price per line, keyed by `inventoryItemId`.
 *  - `lumpSum`  — one total split evenly (in copper) across the lines, so the
 *    per-line `currencyDelta`s sum exactly to the total (see `splitLumpSum`).
 */
export type BulkSellPricing =
  | { mode: "perItem"; prices: Record<string, Currency> }
  | { mode: "lumpSum"; total: Currency };

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };

/**
 * Build the `sell` ops for the selected lines. Empty input returns `[]` so the
 * caller never posts an empty batch to the `.min(1)` endpoint.
 */
export function buildSellOperations(
  lines: SellLine[],
  pricing: BulkSellPricing
): Extract<InventoryOperation, { type: "sell" }>[] {
  if (lines.length === 0) return [];

  if (pricing.mode === "perItem") {
    return lines.map((line) => ({
      type: "sell",
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
      currencyDelta: pricing.prices[line.inventoryItemId] ?? ZERO_CURRENCY,
    }));
  }

  const shares = splitLumpSum(pricing.total, lines.length);
  return lines.map((line, i) => ({
    type: "sell",
    inventoryItemId: line.inventoryItemId,
    quantity: line.quantity,
    currencyDelta: shares[i],
  }));
}
