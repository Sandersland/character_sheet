// The local turn undo can't reverse a server-committed loadout swap, so this
// strip is the explicit refund surface until the swap is refunded or the turn
// ends (#815).

import type { LoadoutSwapControls } from "@/features/session/useLoadoutSwap";

export default function LoadoutRefundStrip({ loadout }: { loadout: LoadoutSwapControls }) {
  const { busy, error, lastSwap, refund } = loadout;
  if (!lastSwap) return null;

  return (
    <div className="rounded-control border border-arcane-200 bg-arcane-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-arcane-800">
          Weapons changed this turn.
        </span>
        <button
          type="button"
          onClick={refund}
          disabled={busy}
          title={`Refund to ${lastSwap.previousLabel}`}
          className="shrink-0 rounded-control border border-arcane-300 bg-arcane-100 px-2.5 py-1 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-200 disabled:opacity-50"
        >
          <span aria-hidden="true">↩ </span>Refund
          <span className="sr-only"> to {lastSwap.previousLabel}</span>
        </button>
      </div>
      {error && <p className="pt-1 text-xs text-garnet-700">{error}</p>}
    </div>
  );
}
