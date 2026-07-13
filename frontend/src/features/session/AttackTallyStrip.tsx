// "This action" tally strip inside the attack sheet (#802, display-only since
// #811): one row per rolled attack — form name, to-hit total with nat-20/nat-1
// badges, the single damage slot, and the verdict. Resolved rows are FINAL here
// (correctable only via the Turn-summary banner's quiet Change row); an
// unresolved row keeps the tappable "hit or miss?" affordance, expanding
// Hit / Miss / Crit! in place — the same rule the banner follows.

import { useState } from "react";

import { isCritRow, isMissRow, isUnresolvedRow } from "@/lib/attackTallySummary";
import type { AttackTallyRow, TallyRowSource, TallyVerdict } from "@/lib/attackTallySummary";

const VERDICT_LABEL: Record<TallyVerdict, string> = { hit: "Hit", miss: "Miss", crit: "Crit" };

const VERDICT_CHIP: Record<TallyVerdict, string> = {
  hit: "border-arcane-300 bg-arcane-100 text-arcane-800",
  miss: "border-parchment-300 bg-parchment-200 text-parchment-600",
  crit: "border-garnet-300 bg-garnet-100 text-garnet-800",
};

function ResolveButtons({
  row,
  onPick,
}: {
  row: AttackTallyRow;
  onPick: (verdict: TallyVerdict) => void;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      {(["hit", "miss", "crit"] as const).map((verdict) => (
        <button
          key={verdict}
          type="button"
          onClick={() => onPick(verdict)}
          aria-label={`${VERDICT_LABEL[verdict]} — ${row.formName}`}
          className={`rounded-control border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            verdict === "crit"
              ? "border-garnet-200 bg-garnet-50 text-garnet-800 hover:bg-garnet-100"
              : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
          }`}
        >
          {verdict === "crit" ? "Crit!" : VERDICT_LABEL[verdict]}
        </button>
      ))}
    </span>
  );
}

function NatBadge({ kind }: { kind: "nat20" | "nat1" }) {
  return kind === "nat20" ? (
    <span className="rounded-control bg-garnet-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-garnet-800">
      nat 20
    </span>
  ) : (
    <span className="rounded-control bg-parchment-200 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-parchment-600">
      nat 1
    </span>
  );
}

// The verdict cell: unresolved rows get the tappable question (→ expand),
// resolved rows a static, final chip.
function VerdictCell({
  row,
  expanded,
  onExpand,
  onPick,
}: {
  row: AttackTallyRow;
  expanded: boolean;
  onExpand: () => void;
  onPick: (verdict: TallyVerdict) => void;
}) {
  if (isUnresolvedRow(row)) {
    return expanded ? (
      <ResolveButtons row={row} onPick={onPick} />
    ) : (
      <button
        type="button"
        onClick={onExpand}
        className="shrink-0 text-[10px] font-semibold text-garnet-700 underline decoration-dotted underline-offset-2 hover:text-garnet-900"
      >
        hit or miss?
      </button>
    );
  }
  const verdict = row.verdict ?? (isCritRow(row) ? "crit" : "hit");
  return (
    <span
      className={`shrink-0 rounded-control border px-2 py-0.5 text-[10px] font-semibold ${VERDICT_CHIP[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function TallyRow({
  row,
  expanded,
  onExpand,
  onPick,
}: {
  row: AttackTallyRow;
  expanded: boolean;
  onExpand: () => void;
  onPick: (verdict: TallyVerdict) => void;
}) {
  const miss = isMissRow(row);
  return (
    <li className={`flex items-center gap-2 text-xs ${miss ? "opacity-50" : ""}`}>
      <span className="min-w-0 flex-1 truncate font-semibold text-parchment-900">{row.formName}</span>
      <span className="tabular-nums text-parchment-700">{row.attack.total}</span>
      {row.attack.nat20 && <NatBadge kind="nat20" />}
      {row.attack.nat1 && <NatBadge kind="nat1" />}
      <span className="w-12 text-right tabular-nums text-parchment-600">
        {miss ? "—" : row.damage ?? "—"}
      </span>
      <VerdictCell row={row} expanded={expanded} onExpand={onExpand} onPick={onPick} />
    </li>
  );
}

export default function AttackTallyStrip({
  rows,
  onSetVerdict,
  source,
  heading = "This action",
}: {
  rows: AttackTallyRow[];
  onSetVerdict: (index: number, verdict: TallyVerdict | undefined) => void;
  /** Show only rows from this slot; verdict writes still carry the GLOBAL index (#813). */
  source?: TallyRowSource;
  heading?: string;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  // Keep each row's global index so onSetVerdict targets the right tally entry.
  const shown = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => source === undefined || row.source === source);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-parchment-300 bg-parchment-100/60 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">{heading}</p>
      <ul className="flex flex-col gap-1">
        {shown.map(({ row, index }) => (
          <TallyRow
            key={row.id}
            row={row}
            expanded={expandedIndex === index}
            onExpand={() => setExpandedIndex(index)}
            onPick={(verdict) => {
              onSetVerdict(index, verdict);
              setExpandedIndex(null);
            }}
          />
        ))}
      </ul>
    </div>
  );
}
