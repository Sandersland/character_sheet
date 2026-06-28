import { useState } from "react";

import { buildSellOperations, type BulkSellPricing, type SellLine } from "@/lib/bulkSell";
import type { Currency, InventoryItem, InventoryOperation } from "@/types/character";

interface BulkSellPanelProps {
  items: InventoryItem[];
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onClose: () => void;
}

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };
const DENOMINATIONS = ["pp", "gp", "sp", "cp"] as const;

/** Per-stack sale value prefilled into a row — mirrors InventoryRow's single-sell default. */
function currencyTimesQuantity(cost: Currency | undefined, quantity: number): Currency {
  if (!cost) return ZERO_CURRENCY;
  return { cp: cost.cp * quantity, sp: cost.sp * quantity, gp: cost.gp * quantity, pp: cost.pp * quantity };
}

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm";
const labelClass = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600";

/**
 * Inline expand-in-place panel (frontend.md: mutate surfaces are inline, not a
 * Modal) for selling several inventory stacks in ONE atomic transaction (issue
 * #103). Presentational only — the orchestrator (`InventoryList`) owns the async
 * state and posts the assembled batch via `applyInventoryTransactions`.
 *
 * Each selected line sells its FULL stack. Two pricing modes:
 *  - Per item — an editable price per line, prefilled from cost × quantity.
 *  - Lump sum — one total split evenly (in copper) across the selected lines.
 */
export default function BulkSellPanel({ items, pending, onSubmit, onClose }: BulkSellPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"perItem" | "lumpSum">("perItem");
  const [prices, setPrices] = useState<Record<string, Currency>>({});
  const [lumpTotal, setLumpTotal] = useState<Currency>(ZERO_CURRENCY);

  function toggleItem(item: InventoryItem) {
    const next = new Set(selected);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
      // Prefill this line's price from its catalog cost the first time it's picked.
      setPrices((prev) =>
        item.id in prev
          ? prev
          : { ...prev, [item.id]: currencyTimesQuantity(item.cost, item.quantity) }
      );
    }
    setSelected(next);
  }

  function setLinePrice(id: string, denomination: (typeof DENOMINATIONS)[number], value: number) {
    setPrices((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? ZERO_CURRENCY), [denomination]: value },
    }));
  }

  const selectedLines: SellLine[] = items
    .filter((item) => selected.has(item.id))
    .map((item) => ({ inventoryItemId: item.id, quantity: item.quantity }));

  async function submit() {
    if (selectedLines.length === 0) return;
    const pricing: BulkSellPricing =
      mode === "perItem" ? { mode: "perItem", prices } : { mode: "lumpSum", total: lumpTotal };
    await onSubmit(buildSellOperations(selectedLines, pricing));
  }

  return (
    <div className="flex flex-col gap-3 rounded-control border border-parchment-200 bg-parchment-100 p-3">
      <div className="flex gap-2">
        {(["perItem", "lumpSum"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-control border px-3 py-1 text-xs font-semibold transition-colors ${
              mode === value
                ? "border-arcane-500 bg-arcane-50 text-arcane-800"
                : "border-parchment-300 text-parchment-600"
            }`}
          >
            {value === "perItem" ? "Per item" : "Lump sum"}
          </button>
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-parchment-200">
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          const price = prices[item.id] ?? ZERO_CURRENCY;
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
              <label className="flex flex-1 items-center gap-2 text-sm text-parchment-900">
                <input type="checkbox" checked={isSelected} onChange={() => toggleItem(item)} />
                <span>
                  {item.name}
                  {item.quantity > 1 && (
                    <span className="ml-1.5 text-xs text-parchment-600">×{item.quantity}</span>
                  )}
                </span>
              </label>
              {isSelected && mode === "perItem" && (
                <div className="flex flex-wrap items-end gap-2">
                  {DENOMINATIONS.map((denomination) => (
                    <label key={denomination} className={labelClass}>
                      {denomination}
                      <input
                        type="number"
                        min={0}
                        aria-label={`${item.name} ${denomination}`}
                        className={`${inputClass} w-14 tabular-nums`}
                        value={price[denomination]}
                        onChange={(e) => setLinePrice(item.id, denomination, Number(e.target.value))}
                      />
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {mode === "lumpSum" && (
        <div className="flex flex-wrap items-end gap-3 border-t border-parchment-200 pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Lump-sum total
          </span>
          {DENOMINATIONS.map((denomination) => (
            <label key={denomination} className={labelClass}>
              {denomination}
              <input
                type="number"
                min={0}
                aria-label={`Lump sum ${denomination}`}
                className={`${inputClass} w-16 tabular-nums`}
                value={lumpTotal[denomination]}
                onChange={(e) =>
                  setLumpTotal({ ...lumpTotal, [denomination]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || selectedLines.length === 0}
          onClick={submit}
          className="rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
        >
          Sell {selectedLines.length > 0 ? `${selectedLines.length} ` : ""}
          {selectedLines.length === 1 ? "item" : "items"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
