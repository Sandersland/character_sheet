// "Turn summary" banner on the turn card (#802/#812, interactive since #811):
// one line per recorded attack. Unresolved lines are tappable ("hit or miss?")
// and expand Hit / Miss / Crit! in place; choosing Hit/Crit grows an inline
// Roll-damage button on the line (3D dice + session log + tally write — no
// sheet reopen). Resolved lines are final but tappable for a quiet Change row
// (never on nat-locked lines). Dismiss clears the tally itself, so dismissal
// survives a page reload of the persisted turn snapshot.

import { useState } from "react";

import {
  attackTallyLine,
  isCritRow,
  isUnresolvedRow,
  isVerdictLocked,
} from "@/lib/attackTallySummary";
import type { TallyResolve } from "@/features/session/useTallyResolve";
import type { AttackTallyRow, TallyVerdict } from "@/lib/attackTallySummary";

const VERDICT_OPTIONS: { verdict: TallyVerdict; label: string }[] = [
  { verdict: "hit", label: "Hit" },
  { verdict: "miss", label: "Miss" },
  { verdict: "crit", label: "Crit!" },
];

function VerdictPick({
  row,
  exclude,
  onPick,
}: {
  row: AttackTallyRow;
  exclude?: TallyVerdict;
  onPick: (verdict: TallyVerdict) => void;
}) {
  return (
    <span className="inline-flex gap-1.5">
      {VERDICT_OPTIONS.filter((o) => o.verdict !== exclude).map((o) => (
        <button
          key={o.verdict}
          type="button"
          onClick={() => onPick(o.verdict)}
          aria-label={`${o.label} — ${row.formName}`}
          className={`rounded-control border px-2 py-1 text-[11px] font-semibold transition-colors ${
            o.verdict === "crit"
              ? "border-garnet-200 bg-garnet-50 text-garnet-800 hover:bg-garnet-100"
              : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

// Unresolved line: the question is the affordance — the same dotted-underline
// rule as the in-sheet tally strip.
function UnresolvedLine({
  row,
  expanded,
  onToggle,
  onPick,
}: {
  row: AttackTallyRow;
  expanded: boolean;
  onToggle: () => void;
  onPick: (verdict: TallyVerdict) => void;
}) {
  return (
    <li className="text-xs text-gold-800">
      <span>
        {row.formName}: to-hit <span className="tabular-nums">{row.attack.total}</span> —{" "}
      </span>
      {expanded ? (
        <VerdictPick row={row} onPick={onPick} />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="font-semibold text-garnet-700 underline decoration-dotted underline-offset-2 hover:text-garnet-900"
        >
          hit or miss?
        </button>
      )}
    </li>
  );
}

/** The on-line damage roll that grows on a resolved hit/crit line without damage. */
function LineDamageButton({
  row,
  crit,
  onRoll,
}: {
  row: AttackTallyRow;
  crit: boolean;
  onRoll: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRoll}
      aria-label={`Roll ${crit ? "crit " : ""}damage — ${row.formName}`}
      className={`ml-1.5 rounded-control border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
        crit
          ? "border-garnet-200 bg-garnet-50 text-garnet-800 hover:bg-garnet-100"
          : "border-gold-300 bg-gold-100 text-gold-800 hover:bg-gold-200"
      }`}
    >
      {crit ? "Roll crit damage" : "Roll damage"}
    </button>
  );
}

// Resolved line: final text; tappable (unless nat-locked) for the quiet Change
// row, plus the inline damage roll while the hit/crit line has no damage yet.
function ResolvedLine({
  row,
  index,
  resolve,
  expanded,
  onToggle,
  onPick,
}: {
  row: AttackTallyRow;
  index: number;
  resolve: TallyResolve;
  expanded: boolean;
  onToggle: () => void;
  onPick: (verdict: TallyVerdict) => void;
}) {
  const locked = isVerdictLocked(row);
  const crit = isCritRow(row);
  const needsDamage =
    row.verdict !== "miss" && row.damage === undefined && resolve.canRollDamage(row);
  const text = needsDamage
    ? `${row.formName}: ${crit ? "crit!" : "hit"} — to-hit ${row.attack.total} —`
    : attackTallyLine(row);

  return (
    <li className="text-xs text-gold-800">
      {locked ? (
        <span>{text}</span>
      ) : (
        // Resolved lines carry no visible affordance — tapping reveals the quiet
        // Change row below (mistaken-verdict recovery).
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Change verdict — ${row.formName}`}
          className="text-left hover:text-gold-900"
        >
          {text}
        </button>
      )}
      {needsDamage && (
        <LineDamageButton row={row} crit={crit} onRoll={() => resolve.rollDamageFor(index, row)} />
      )}
      {expanded && !locked && (
        <span className="mt-1 flex items-center gap-1.5">
          <span className="text-[11px] text-gold-800/80">Change ·</span>
          <VerdictPick row={row} exclude={row.verdict} onPick={onPick} />
        </span>
      )}
    </li>
  );
}

function BannerLine({
  row,
  index,
  resolve,
  expanded,
  onToggle,
}: {
  row: AttackTallyRow;
  index: number;
  resolve: TallyResolve;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pick = (verdict: TallyVerdict) => {
    resolve.setVerdict(index, verdict);
    if (expanded) onToggle();
  };
  return isUnresolvedRow(row) ? (
    <UnresolvedLine row={row} expanded={expanded} onToggle={onToggle} onPick={pick} />
  ) : (
    <ResolvedLine
      row={row}
      index={index}
      resolve={resolve}
      expanded={expanded}
      onToggle={onToggle}
      onPick={pick}
    />
  );
}

export default function TurnSummaryBanner({
  rows,
  onDismiss,
  resolve,
}: {
  rows: AttackTallyRow[];
  onDismiss: () => void;
  resolve: TallyResolve;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  if (rows.length === 0) return null;

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
        {rows.map((row, i) => (
          <BannerLine
            key={i}
            row={row}
            index={i}
            resolve={resolve}
            expanded={expandedIndex === i}
            onToggle={() => setExpandedIndex((cur) => (cur === i ? null : i))}
          />
        ))}
      </ul>
    </div>
  );
}
