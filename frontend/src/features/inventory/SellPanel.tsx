import { useState } from "react";
import { HelpCircle } from "lucide-react";

import {
  copperToGp,
  defaultSellPrice,
  gpToCopper,
  resolveSellPrices,
  toGoldSilverCopper,
  type SellLine,
} from "@/lib/bulkSell";
import { formatCurrency, toCopper } from "@/lib/currency";
import type { Currency, InventoryItem } from "@/types/character";

interface SellPanelProps {
  items: InventoryItem[];
  pending: boolean;
  onConfirm: (lines: SellLine[], prices: Record<string, Currency>) => void;
  onCancel: () => void;
}

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-1.5 py-0.5 text-xs tabular-nums";

// Copper as the gold string a decimal-gold input shows: "37.5", "55", "0.25".
function gpString(copper: number): string {
  return String(copperToGp(copper));
}

// Normalized gp/sp/cp total the sale actually pays out, for the denominational
// readout — sum in copper, then decompose (carrying up, no platinum roll-up) so
// "24 sp 10 cp" reads as the "2 gp 5 sp" it really is.
function resolvedTotalObject(prices: Record<string, Currency>, items: InventoryItem[]): Currency {
  const copper = items.reduce((sum, item) => sum + toCopper(prices[item.id]), 0);
  return toGoldSilverCopper(copper);
}

/**
 * Bulk-sale review. The money is entered as a single gold total (split evenly
 * across the selected lines); a line can optionally be pinned to its own price
 * via "Set price", and the remaining total then splits across the rest. Each
 * line keeps its own editable quantity. Resolves to a per-line price map that
 * flows through `buildSellOperations`.
 */
export default function SellPanel({ items, pending, onConfirm, onCancel }: SellPanelProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.quantity]))
  );
  // Per-line price overrides, as raw gold-input text. Presence = the line is
  // pinned to that price; absent = it shares the total evenly.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Which rows have their price editor open.
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  // The sale total as raw gold-input text; `null` means "follow the auto total".
  const [totalText, setTotalText] = useState<string | null>(null);
  // Toggles the inline "how pricing works" help disclosure.
  const [showHelp, setShowHelp] = useState(false);

  const lines: SellLine[] = items.map((item) => ({
    inventoryItemId: item.id,
    quantity: quantities[item.id],
  }));

  // An empty input means the row is open but not yet priced — it must NOT count
  // as a pin (else `Number("") = 0` would silently sell the item for 0 gp).
  const overridesCopper: Record<string, number> = Object.fromEntries(
    Object.entries(overrides)
      .filter(([, text]) => text.trim() !== "")
      .map(([id, text]) => [id, gpToCopper(Number(text))])
  );

  // Auto total: each pinned line at its override, each other at half catalog value.
  const autoTotalCopper = items.reduce((sum, item) => {
    const copper =
      item.id in overridesCopper
        ? overridesCopper[item.id]
        : toCopper(defaultSellPrice(item.cost, quantities[item.id]));
    return sum + copper;
  }, 0);

  const targetCopper = totalText === null ? autoTotalCopper : gpToCopper(Number(totalText));
  const prices = resolveSellPrices(lines, overridesCopper, targetCopper);
  const resolvedTotal = resolvedTotalObject(prices, items);

  function setQuantity(item: InventoryItem, raw: number) {
    const quantity = Math.min(item.quantity, Math.max(1, Math.floor(raw || 1)));
    setQuantities((prev) => ({ ...prev, [item.id]: quantity }));
  }

  function openRow(id: string) {
    setOpenRows((prev) => new Set(prev).add(id));
  }

  function setOverride(id: string, text: string) {
    setOverrides((prev) => ({ ...prev, [id]: text }));
  }

  function clearOverride(id: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOpenRows((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function confirm() {
    onConfirm(lines, prices);
  }

  return (
    <section
      aria-label="Confirm sale"
      className="flex flex-col gap-3 rounded-card border border-parchment-300 bg-parchment-100 p-3"
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Confirm sale</h4>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            aria-label="How pricing works"
            aria-expanded={showHelp}
            aria-controls="sell-help"
            className="text-parchment-400 transition-colors hover:text-parchment-700"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <p className="text-xs text-parchment-500">
          Enter one total for the sale; it splits evenly across items. Set a per-item price to pin one.
        </p>
      </div>

      {showHelp && (
        <div
          id="sell-help"
          className="flex flex-col gap-1.5 rounded-control border border-parchment-300 bg-parchment-50 p-2.5 text-xs text-parchment-600"
        >
          <p>
            <span className="font-semibold text-parchment-700">Total received</span> is one gold amount for the
            whole sale, split evenly across the selected items. It prefills to half each item's catalog value.
          </p>
          <p>
            <span className="font-semibold text-parchment-700">Silver &amp; copper:</span> use decimals —{" "}
            <span className="tabular-nums">0.5</span> gp = 5 sp, <span className="tabular-nums">0.05</span> gp =
            5 cp (copper is the smallest coin, so two decimals is as fine as it goes). The{" "}
            <span className="font-semibold">= …</span> line shows the exact coins you'll receive.
          </p>
          <p>
            <span className="font-semibold text-parchment-700">Platinum:</span> amounts stay in gp/sp/cp here —
            1 pp is just 10 gp of value. Hold or convert coins into platinum from{" "}
            <span className="font-semibold">Edit purse</span>.
          </p>
          <p>
            <span className="font-semibold text-parchment-700">Set price</span> pins one item to an exact amount;
            the remaining total then splits across the other items.
          </p>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-parchment-200">
        {items.map((item) => {
          const pinned = item.id in overridesCopper;
          const open = openRows.has(item.id);
          return (
            <li key={item.id} className="flex flex-col gap-1.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-parchment-900">{item.name}</span>
                <label className="flex shrink-0 items-center gap-1 text-xs text-parchment-600">
                  Qty
                  <input
                    type="number"
                    min={1}
                    max={item.quantity}
                    value={quantities[item.id]}
                    onChange={(e) => setQuantity(item, Number(e.target.value))}
                    aria-label={`Quantity to sell of ${item.name}`}
                    className={`${inputClass} w-14`}
                  />
                  <span className="text-parchment-500">/ {item.quantity}</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-parchment-600">
                {open ? (
                  <>
                    <label className="flex items-center gap-1">
                      Price
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={overrides[item.id] ?? ""}
                        onChange={(e) => setOverride(item.id, e.target.value)}
                        aria-label={`Custom price in gold for ${item.name}`}
                        className={`${inputClass} w-20`}
                      />
                      gp
                    </label>
                    <button
                      type="button"
                      onClick={() => clearOverride(item.id)}
                      aria-label={`Use automatic price for ${item.name}`}
                      className="font-medium text-parchment-500 hover:text-parchment-700 hover:underline"
                    >
                      Use automatic price
                    </button>
                  </>
                ) : pinned ? (
                  <button
                    type="button"
                    onClick={() => openRow(item.id)}
                    aria-label={`Edit custom price for ${item.name}`}
                    className="inline-flex items-center gap-1 rounded-control bg-parchment-200 px-1.5 py-0.5 font-medium text-parchment-700 hover:bg-parchment-300"
                  >
                    Custom: {formatCurrency(prices[item.id])}
                    <span className="text-parchment-500">· Edit</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openRow(item.id)}
                    aria-label={`Set a custom price for ${item.name}`}
                    className="font-medium text-garnet-700 hover:text-garnet-800 hover:underline"
                  >
                    Set price
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t border-parchment-200 pt-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 font-semibold text-parchment-700">
            Total received
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={totalText ?? gpString(autoTotalCopper)}
              onChange={(e) => setTotalText(e.target.value)}
              aria-label="Total gold received"
              className={`${inputClass} w-24`}
            />
            gp
          </label>
          {totalText !== null && (
            <button
              type="button"
              onClick={() => setTotalText(null)}
              aria-label="Reset total to the automatic amount"
              className="font-medium text-parchment-500 hover:text-parchment-700 hover:underline"
            >
              Auto
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-parchment-500">= {formatCurrency(resolvedTotal)}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={confirm}
              className="rounded-control bg-garnet-700 px-2.5 py-1 font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
            >
              Sell
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="font-semibold text-parchment-600 hover:underline disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
