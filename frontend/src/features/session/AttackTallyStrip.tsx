// "This action" tally strip inside the attack sheet (#802): one row per rolled
// attack — form name, to-hit total with nat-20/nat-1 badges, the single damage
// slot, and a tap-to-cycle verdict chip. Miss rows dim. Auto rows (nat 20 / nat 1)
// show a locked verdict.

import { isCritRow, isMissRow, isVerdictLocked } from "@/lib/attackTallySummary";
import type { AttackTallyRow, TallyVerdict } from "@/lib/attackTallySummary";

const VERDICT_LABEL: Record<TallyVerdict, string> = { hit: "Hit", miss: "Miss", crit: "Crit" };

const VERDICT_CHIP: Record<TallyVerdict, string> = {
  hit: "border-arcane-300 bg-arcane-100 text-arcane-800",
  miss: "border-parchment-300 bg-parchment-200 text-parchment-600",
  crit: "border-garnet-300 bg-garnet-100 text-garnet-800",
};

function verdictChipClass(row: AttackTallyRow): string {
  return row.verdict ? VERDICT_CHIP[row.verdict] : "border-parchment-300 bg-parchment-50 text-parchment-500";
}

export default function AttackTallyStrip({
  rows,
  onCycleVerdict,
}: {
  rows: AttackTallyRow[];
  onCycleVerdict: (index: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-parchment-300 bg-parchment-100/60 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">This action</p>
      <ul className="flex flex-col gap-1">
        {rows.map((row, index) => {
          const miss = isMissRow(row);
          const locked = isVerdictLocked(row);
          return (
            <li
              key={index}
              className={`flex items-center gap-2 text-xs ${miss ? "opacity-50" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-parchment-900">{row.formName}</span>
              <span className="tabular-nums text-parchment-700">{row.attack.total}</span>
              {row.attack.nat20 && (
                <span className="rounded-control bg-garnet-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-garnet-800">
                  nat 20
                </span>
              )}
              {row.attack.nat1 && (
                <span className="rounded-control bg-parchment-200 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-parchment-600">
                  nat 1
                </span>
              )}
              <span className="w-12 text-right tabular-nums text-parchment-600">
                {miss ? "—" : row.damage ?? "—"}
              </span>
              <button
                type="button"
                disabled={locked}
                onClick={() => onCycleVerdict(index)}
                aria-label={`Verdict for ${row.formName}`}
                className={`shrink-0 rounded-control border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed ${verdictChipClass(row)}`}
              >
                {row.verdict ? VERDICT_LABEL[row.verdict] : isCritRow(row) ? "Crit" : "Set"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
