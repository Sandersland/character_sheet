// currencyDelta is captured per line at sale time so the op is explicit regardless of later catalog drift.
import { splitLumpSum, toCopper } from "@/lib/currency";
import type { Currency, InventoryOperation } from "@/types/character";

export interface SellLine {
  inventoryItemId: string;
  quantity: number;
}

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };

export function defaultSellPrice(cost: Currency | undefined, quantity: number): Currency {
  let remaining = Math.floor(toCopper(cost ?? ZERO_CURRENCY) / 2) * Math.max(0, quantity);
  const gp = Math.floor(remaining / 100);
  remaining -= gp * 100;
  const sp = Math.floor(remaining / 10);
  remaining -= sp * 10;
  return { cp: remaining, sp, gp, pp: 0 };
}

export function gpToCopper(gp: number): number {
  return Math.max(0, Math.round((Number.isFinite(gp) ? gp : 0) * 100));
}

// No platinum roll-up, matching defaultSellPrice's convention — contrast currency.fromCopper, which does roll up.
export function toGoldSilverCopper(copper: number): Currency {
  let remaining = Math.max(0, Math.round(copper));
  const gp = Math.floor(remaining / 100);
  remaining -= gp * 100;
  const sp = Math.floor(remaining / 10);
  remaining -= sp * 10;
  return { cp: remaining, sp, gp, pp: 0 };
}

export function copperToGp(copper: number): number {
  return Math.max(0, copper) / 100;
}

// Resolved amounts sum to max(totalCopper, Σ overrides) — pins are never silently discounted; feeds buildSellOperations' perItem price map.
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
    const shares = splitLumpSum(toGoldSilverCopper(pool), unpinned.length);
    unpinned.forEach((line, i) => {
      prices[line.inventoryItemId] = toGoldSilverCopper(toCopper(shares[i]));
    });
  }
  return prices;
}

// lumpSum splits totalCopper evenly across lines so currencyDeltas sum exactly to the total (splitLumpSum).
export type BulkSellPricing =
  | { mode: "perItem"; prices: Record<string, Currency> }
  | { mode: "lumpSum"; total: Currency };

// Empty input returns [] so the caller never posts an empty batch to the .min(1) endpoint.
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
