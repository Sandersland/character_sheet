import { useState } from "react";

import { defaultSellPrice, type SellLine } from "@/lib/bulkSell";
import { addCurrency, formatCurrency } from "@/lib/currency";
import type { Currency, InventoryItem } from "@/types/character";

interface SellPanelProps {
  items: InventoryItem[];
  pending: boolean;
  onConfirm: (lines: SellLine[], prices: Record<string, Currency>) => void;
  onCancel: () => void;
}

// Per-line editable draft: how many of the stack to sell + the amount received.
interface SellDraft {
  quantity: number;
  price: Currency;
  // Once the player types a price we stop re-prefilling it as quantity changes.
  priceEdited: boolean;
}

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };
const DENOMINATIONS = ["pp", "gp", "sp", "cp"] as const;

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-1.5 py-0.5 text-xs tabular-nums";

function seedDrafts(items: InventoryItem[]): Record<string, SellDraft> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      { quantity: item.quantity, price: defaultSellPrice(item.cost, item.quantity), priceEdited: false },
    ])
  );
}

// Multi-select sell review: each selected line gets an editable quantity + amount-received, prefilled to half catalog value, summing to a running total.
export default function SellPanel({ items, pending, onConfirm, onCancel }: SellPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, SellDraft>>(() => seedDrafts(items));

  function setQuantity(item: InventoryItem, raw: number) {
    const quantity = Math.min(item.quantity, Math.max(1, Math.floor(raw || 1)));
    setDrafts((prev) => {
      const draft = prev[item.id];
      const price = draft.priceEdited ? draft.price : defaultSellPrice(item.cost, quantity);
      return { ...prev, [item.id]: { ...draft, quantity, price } };
    });
  }

  function setPrice(itemId: string, denomination: (typeof DENOMINATIONS)[number], raw: number) {
    setDrafts((prev) => {
      const draft = prev[itemId];
      const value = Math.max(0, Math.floor(raw || 0));
      return {
        ...prev,
        [itemId]: { ...draft, price: { ...draft.price, [denomination]: value }, priceEdited: true },
      };
    });
  }

  const total = items.reduce((sum, item) => addCurrency(sum, drafts[item.id]?.price ?? ZERO_CURRENCY), ZERO_CURRENCY);

  function confirm() {
    const lines: SellLine[] = items.map((item) => ({
      inventoryItemId: item.id,
      quantity: drafts[item.id].quantity,
    }));
    const prices = Object.fromEntries(items.map((item) => [item.id, drafts[item.id].price]));
    onConfirm(lines, prices);
  }

  return (
    <section
      aria-label="Confirm sale"
      className="flex flex-col gap-3 rounded-card border border-parchment-300 bg-parchment-100 p-3"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Confirm sale</h4>
      <ul className="flex flex-col divide-y divide-parchment-200">
        {items.map((item) => {
          const draft = drafts[item.id];
          return (
            <li key={item.id} className="flex flex-col gap-1.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-parchment-900">{item.name}</span>
                <label className="flex items-center gap-1 text-xs text-parchment-600">
                  Qty
                  <input
                    type="number"
                    min={1}
                    max={item.quantity}
                    value={draft.quantity}
                    onChange={(e) => setQuantity(item, Number(e.target.value))}
                    aria-label={`Quantity to sell of ${item.name}`}
                    className={`${inputClass} w-14`}
                  />
                  <span className="text-parchment-500">/ {item.quantity}</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-parchment-600">
                <span>Received</span>
                {DENOMINATIONS.map((denomination) => (
                  <label key={denomination} className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={draft.price[denomination]}
                      onChange={(e) => setPrice(item.id, denomination, Number(e.target.value))}
                      aria-label={`${denomination} received for ${item.name}`}
                      className={`${inputClass} w-14`}
                    />
                    {denomination}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-parchment-200 pt-2 text-xs">
        <span className="font-semibold text-parchment-700">Total received: {formatCurrency(total)}</span>
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
    </section>
  );
}
