import { useEffect, useState } from "react";

import { fetchLedger } from "@/api/client";
import { formatBatchDate, groupByBatch } from "@/lib/timeline";
import type { Currency, LedgerEntry, LedgerEntryType } from "@/types/character";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

interface LedgerModalProps {
  characterId: string;
  /** Pre-applies the filter chip; omit for the global, unfiltered view. */
  inventoryItemId?: string;
  /** Display label for the filter chip — avoids a blank chip before data loads. */
  itemName?: string;
  onClose: () => void;
}

const TYPE_TONE: Record<LedgerEntryType, "vitality" | "gold" | "garnet" | "neutral"> = {
  acquired: "vitality",
  bought: "vitality",
  sold: "gold",
  removed: "garnet",
  consumed: "neutral",
};

const DENOMINATIONS: (keyof Currency)[] = ["pp", "gp", "sp", "cp"];

/** Signed currencyDelta -> "+1 gp 5 sp" / "−2 gp" / null if zero. Every
 * nonzero field shares one sign by construction (see lib/inventory.ts). */
function formatCurrencyDelta(delta: Currency | undefined): string | null {
  if (!delta) return null;
  const parts = DENOMINATIONS.filter((denomination) => delta[denomination] !== 0).map(
    (denomination) => `${Math.abs(delta[denomination])} ${denomination}`
  );
  if (parts.length === 0) return null;
  const isCredit = DENOMINATIONS.some((denomination) => delta[denomination] > 0);
  return `${isCredit ? "+" : "−"}${parts.join(" ")}`;
}

// formatBatchDate and groupByBatch are imported from ../lib/timeline

/**
 * The read-only transaction ledger — one modal shared by both the
 * Inventory card header's global "History" link (unfiltered) and each
 * row's own "History" link (pre-filtered to that `inventoryItemId`), per
 * the frontend-design-architect's recommendation: per-item history can
 * only ever cover currently-held items (a sold/consumed/removed row has
 * nothing left to filter by), so the *global* list is the durable record
 * for fully-disposed items via their snapshotted `itemName`. Sharing one
 * component lets a player go from "what happened to this dagger" to "show
 * me everything" just by clearing the filter chip.
 */
export default function LedgerModal({ characterId, inventoryItemId, itemName, onClose }: LedgerModalProps) {
  const [filter, setFilter] = useState<{ id: string; name?: string } | null>(
    inventoryItemId ? { id: inventoryItemId, name: itemName } : null
  );
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(null);
    setError(null);
    fetchLedger(characterId, filter?.id)
      .then(setEntries)
      .catch(() => setError("Couldn't load the ledger — try again."));
  }, [characterId, filter?.id]);

  const batches = entries ? groupByBatch(entries) : [];

  return (
    <Modal title="Transaction History" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-parchment-600">
          <span>Showing:</span>
          {filter ? (
            <Badge tone="neutral">
              {filter.name ?? "this item"}
              <button
                type="button"
                onClick={() => setFilter(null)}
                aria-label="Clear filter"
                className="ml-1 text-parchment-600 hover:text-garnet-700"
              >
                ×
              </button>
            </Badge>
          ) : (
            <span>All items</span>
          )}
        </div>

        {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

        {entries === null && !error && (
          <p className="text-sm text-parchment-600">Loading…</p>
        )}

        {entries !== null && entries.length === 0 && (
          <p className="py-6 text-center text-sm text-parchment-600">
            No transactions yet. Acquiring, selling, or using items will record history here.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {batches.map((batch) => (
            <li key={batch.key}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
                {formatBatchDate(batch.createdAt)}
              </p>
              <ul className="flex flex-col gap-1">
                {batch.rows.map((entry) => {
                  const currencyText = formatCurrencyDelta(entry.currencyDelta);
                  return (
                    <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge tone={TYPE_TONE[entry.type]}>{entry.type}</Badge>
                        <span className="text-parchment-900">
                          {entry.itemName} ×{Math.abs(entry.quantityDelta)}
                        </span>
                      </span>
                      {currencyText && (
                        <span
                          className={`tabular-nums font-semibold ${
                            currencyText.startsWith("+")
                              ? "text-vitality-700"
                              : "text-garnet-700"
                          }`}
                        >
                          {currencyText}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
