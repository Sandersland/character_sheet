// The turn card's "Spells cast" tally (#1164) — TurnSummaryBanner's precedent,
// simplified: a cast already resolved by the time it lands here (no hit/miss
// verdict to interact with), so this is a quiet read-only list + Dismiss.

import { castTallyLine } from "@/lib/spellPickerView";
import type { CastTallyRow } from "@/features/session/useTurnState";

export default function CastTallyBanner({ rows, onDismiss }: { rows: CastTallyRow[]; onDismiss: () => void }) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 rounded-control border border-arcane-200 bg-arcane-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-arcane-800">Spells cast</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-xs font-semibold text-arcane-700 hover:text-arcane-900"
        >
          Dismiss
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.id} className="text-xs text-arcane-800">
            {castTallyLine(row)}
          </li>
        ))}
      </ul>
    </div>
  );
}
