// "Tell your DM" banner on the turn card (#802): one line per recorded attack
// (hit / nat 1 — miss / crit), shown once the attack sheet is closed and tally
// rows exist. Dismissible; the parent clears it with the tally.

import { useEffect, useState } from "react";

import { attackTallyLines } from "@/lib/attackTallySummary";
import type { AttackTallyRow } from "@/lib/attackTallySummary";

export default function TurnDmBanner({ rows }: { rows: AttackTallyRow[] }) {
  const [dismissed, setDismissed] = useState(false);
  // A cleared tally (new action / end turn) re-arms the banner.
  useEffect(() => {
    if (rows.length === 0) setDismissed(false);
  }, [rows.length]);

  if (rows.length === 0 || dismissed) return null;
  const lines = attackTallyLines(rows);

  return (
    <div className="flex flex-col gap-1 rounded-control border border-gold-200 bg-gold-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-800">Tell your DM</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
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
