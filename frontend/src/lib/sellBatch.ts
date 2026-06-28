/**
 * Summarize a bulk-sale batch (issue #104) for the Activity timeline.
 *
 * A batch is a collapsible bulk sale iff it has MORE THAN ONE row and EVERY
 * row is a `sold` event. Single-item sales and mixed/non-sell batches are not
 * summarized (return `null`) and render normally.
 *
 * Each `CharacterEvent.data` is typed `unknown` on the frontend, so we narrow
 * it defensively: a row with missing/garbage `data` contributes a zero
 * currency delta and an empty name rather than throwing.
 *
 * This is a sibling of timeline.ts on purpose — timeline.ts stays generic over
 * `{ id, batchId, createdAt }`; the sell-specific shape lives here.
 */

import { addCurrency, formatCurrency } from "@/lib/currency";
import type { CharacterEvent, Currency } from "@/types/character";

const ZERO: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };

interface SoldData {
  itemName?: string;
  quantityDelta?: number;
  currencyDelta?: Currency;
}

function isCurrency(value: unknown): value is Currency {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.cp === "number" &&
    typeof c.sp === "number" &&
    typeof c.gp === "number" &&
    typeof c.pp === "number"
  );
}

function narrowSoldData(data: unknown): SoldData {
  if (typeof data !== "object" || data === null) return {};
  const d = data as Record<string, unknown>;
  return {
    itemName: typeof d.itemName === "string" ? d.itemName : undefined,
    quantityDelta: typeof d.quantityDelta === "number" ? d.quantityDelta : undefined,
    currencyDelta: isCurrency(d.currencyDelta) ? d.currencyDelta : undefined,
  };
}

export interface SellBatchSummary {
  itemCount: number;
  total: Currency;
  totalLabel: string;
  items: { name: string; quantity: number }[];
}

/**
 * Returns a one-line summary of a sold batch, or `null` when the rows are not
 * a collapsible bulk sale (≤1 row, or any non-`sold` row). Currency is summed
 * field-wise (via `addCurrency`) so the total stays in the denominations the
 * items actually sold for — three 15 gp sales read "45 gp", not the normalized
 * "4 pp 5 gp". `totalLabel` is the unsigned `formatCurrency` rendering. Item
 * quantities use the absolute value of each row's (negative) `quantityDelta`.
 */
export function summarizeSellBatch(rows: CharacterEvent[]): SellBatchSummary | null {
  if (rows.length <= 1) return null;
  if (!rows.every((r) => r.type === "sold")) return null;

  let total: Currency = { ...ZERO };
  const items = rows.map((r) => {
    const { itemName, quantityDelta, currencyDelta } = narrowSoldData(r.data);
    total = addCurrency(total, currencyDelta ?? ZERO);
    return { name: itemName ?? "", quantity: Math.abs(quantityDelta ?? 0) };
  });

  return {
    itemCount: rows.length,
    total,
    totalLabel: formatCurrency(total),
    items,
  };
}
