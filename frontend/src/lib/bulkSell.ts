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

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };

// Prefill: half the per-unit catalog value (rounded down) × quantity, kept in gp/sp/cp (no platinum roll-up) so a 15 gp default reads "15 gp".
export function defaultSellPrice(cost: Currency | undefined, quantity: number): Currency {
  let remaining = Math.floor(toCopper(cost ?? ZERO_CURRENCY) / 2) * Math.max(0, quantity);
  const gp = Math.floor(remaining / 100);
  remaining -= gp * 100;
  const sp = Math.floor(remaining / 10);
  remaining -= sp * 10;
  return { cp: remaining, sp, gp, pp: 0 };
}

/** A single decimal-gold amount (e.g. `37.5` gp) as copper, rounded to the nearest copper. */
export function gpToCopper(gp: number): number {
  return Math.max(0, Math.round((Number.isFinite(gp) ? gp : 0) * 100));
}

// Decompose copper into gp/sp/cp with NO platinum roll-up, so a 15 gp sale
// records as "15 gp" (not "1 pp 5 gp") — matching `defaultSellPrice`'s
// convention. (Contrast `currency.fromCopper`, which rolls up to platinum.)
export function toGoldSilverCopper(copper: number): Currency {
  let remaining = Math.max(0, Math.round(copper));
  const gp = Math.floor(remaining / 100);
  remaining -= gp * 100;
  const sp = Math.floor(remaining / 10);
  remaining -= sp * 10;
  return { cp: remaining, sp, gp, pp: 0 };
}

/** Copper as a decimal-gold number for a single gold input box (e.g. `3750` → `37.5`). */
export function copperToGp(copper: number): number {
  return Math.max(0, copper) / 100;
}

/**
 * Resolve every selected line to a concrete `Currency` for a single-total sale.
 * Lines the player pinned to an explicit price (`overridesCopper`) take that
 * amount; the rest split what's left of `totalCopper` evenly (`splitLumpSum`,
 * earliest lines absorb the leftover copper). The resolved amounts sum to
 * `max(totalCopper, Σ overrides)` — pins are never silently discounted — and
 * this is exactly the `perItem` price map `buildSellOperations` consumes.
 */
export function resolveSellPrices(
  lines: SellLine[],
  overridesCopper: Record<string, number>,
  totalCopper: number
): Record<string, Currency> {
  const prices: Record<string, Currency> = {};
  const pinned = lines.filter((line) => line.inventoryItemId in overridesCopper);
  const unpinned = lines.filter((line) => !(line.inventoryItemId in overridesCopper));

  let pinnedCopper = 0;
  for (const line of pinned) {
    const copper = Math.max(0, Math.round(overridesCopper[line.inventoryItemId]));
    prices[line.inventoryItemId] = toGoldSilverCopper(copper);
    pinnedCopper += copper;
  }

  const pool = Math.max(0, Math.round(totalCopper) - pinnedCopper);
  if (unpinned.length > 0) {
    // splitLumpSum divides the copper pool exactly; re-decompose each share
    // without platinum roll-up to keep the recorded denominations gp/sp/cp.
    const shares = splitLumpSum(toGoldSilverCopper(pool), unpinned.length);
    unpinned.forEach((line, i) => {
      prices[line.inventoryItemId] = toGoldSilverCopper(toCopper(shares[i]));
    });
  }
  return prices;
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
