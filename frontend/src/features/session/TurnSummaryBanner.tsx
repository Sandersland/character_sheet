// "Turn summary" banner on the turn card (#802, renamed #812): one line per
// recorded attack (hit / nat 1 — miss / crit), shown once the attack sheet is
// closed and tally rows exist. Dismiss clears the tally itself (the tally is
// the banner's source of truth), so dismissal survives a page reload of the
// persisted turn snapshot.

import { attackTallyLines } from "@/lib/attackTallySummary";
import type { AttackTallyRow } from "@/lib/attackTallySummary";

export default function TurnSummaryBanner({
  rows,
  onDismiss,
}: {
  rows: AttackTallyRow[];
  onDismiss: () => void;
}) {
  if (rows.length === 0) return null;
  const lines = attackTallyLines(rows);

  return (
    <div className="flex flex-col gap-1 rounded-control border border-gold-200 bg-gold-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-800">Turn summary</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-xs font-semibold text-gold-700 hover:text-gold-900"
        >
          Dismiss
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {lines.map((line, i) => (
          <li key={i} className="text-xs text-gold-800">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
