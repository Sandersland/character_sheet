// Shared rail primitives (#1831 fallow-flagged clone extraction): the numbered
// dot + connector step shell and the verdict/crit call widgets AttackStepCard
// and ResolutionRail both render. Extracted here rather than left duplicated —
// AttackStepCard's own behavior/API is unchanged, only its internal Step/
// VerdictChip/CritButton definitions now import from here; ResolutionRail is
// the second, generalized consumer.

import DamageRiderList from "@/features/session/DamageRiderList";
import type { ResolutionView } from "@/features/session/useResolution";
import type { AttackState } from "@/features/session/useTurnState";
import type { StepState } from "@/lib/attackStepRail";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";

const DOT_STYLE: Record<StepState, string> = {
  done: "border-garnet-600 bg-garnet-soft-surface text-garnet-on-surface",
  active: "border-garnet-600 bg-parchment-50 text-garnet-700",
  pending: "border-parchment-300 bg-parchment-50 text-parchment-400",
};

const LABEL_STYLE: Record<StepState, string> = {
  done: "text-parchment-600",
  active: "text-parchment-900",
  pending: "text-parchment-400",
};

/** One rail step: numbered dot + connector, label, and the step's content. */
export function RailStep({
  number,
  state,
  label,
  last = false,
  children,
}: {
  number: number;
  state: StepState;
  label: string;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${DOT_STYLE[state]}`}
        >
          {state === "done" ? "✓" : number}
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-parchment-300" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-3"}`}>
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${LABEL_STYLE[state]}`}>
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

/** Small verdict chip (nat-locked calls, ✓ Hit, Crit!, Miss). */
export function VerdictChip({ tone, children }: { tone: "crit" | "miss" | "hit"; children: React.ReactNode }) {
  const cls =
    tone === "crit"
      ? "bg-garnet-100 text-garnet-800"
      : tone === "hit"
        ? "bg-arcane-100 text-arcane-800"
        : "bg-parchment-200 text-parchment-600";
  return (
    <span className={`inline-block rounded-control px-2 py-1 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

/**
 * The name + magical badge + "+N to hit · damage label" stats line (#1832
 * fallow-flagged clone extraction): AttackStepCard's own SelectedFormSummary
 * wraps this with its roll-mode chip; InlineAttackPicker's AttackFormSummary
 * renders it bare (ResolutionRail shows the chip separately, #1831).
 */
export function AttackFormSummaryCore({ selected }: { selected: AttackEntry }) {
  return (
    <>
      <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-parchment-900">
        {selected.name}
        {selected.magical && (
          <span
            title="Counts as magical for overcoming resistance to nonmagical damage"
            className="rounded-control bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-800"
          >
            Magical
          </span>
        )}
      </span>
      <span className="block truncate text-xs text-parchment-600">
        {selected.attackLabel} to hit · {selected.damageLabel}
        {selected.note && <span className="ml-1 italic">{selected.note}</span>}
      </span>
    </>
  );
}

/** "Attacks · N of M remaining" kicker with spent/remaining pips (total > 1
 *  only) — shared by the Attack sheet's Extra Attack loop and Flurry's
 *  2+-strike loop (moved out of AttackStepCard.tsx, retired #1845). */
export function AttackKickerPips({ attack }: { attack: AttackState | null }) {
  if (!attack || attack.total <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {Array.from({ length: attack.total }).map((_, i) => (
          <span
            key={i}
            className={`inline-block h-2 w-2 rounded-full ${
              i < attack.used ? "bg-parchment-300" : "bg-garnet-soft-surface"
            }`}
          />
        ))}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-garnet-700">
        Attacks · {attack.total - attack.used} of {attack.total} remaining
      </span>
    </div>
  );
}

/**
 * On-hit dice riders (Flame Tongue +2d6 fire) — visible once a to-hit roll
 * exists for this swing and it isn't a called/auto miss (#1832/#1845 shared
 * gate — every useResolution-driven picker, weapon or bonus, hides riders the
 * same way the pre-#1832 boundView binding did).
 */
export function DamageRidersPanel({
  resolutionView,
  armedEntry,
  riderTotals,
  onDamageRider,
}: {
  resolutionView: ResolutionView;
  armedEntry: AttackEntry;
  riderTotals: Record<string, number>;
  onDamageRider: (rider: DamageRider) => void;
}) {
  if (!resolutionView.toHitRoll || resolutionView.verdict === "miss" || armedEntry.damageRiders.length === 0) {
    return null;
  }
  return (
    <DamageRiderList riders={armedEntry.damageRiders} riderTotals={riderTotals} onDamageRider={onDamageRider} />
  );
}

/** The small garnet "Crit!" call/upgrade button. */
export function CritButton({
  onCallCrit,
  tall = false,
  disabled = false,
}: {
  onCallCrit: () => void;
  tall?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onCallCrit}
      disabled={disabled}
      className={`rounded-control border border-garnet-200 bg-garnet-50 font-semibold text-garnet-800 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40 ${
        tall ? "min-h-11 flex-1 px-3 text-xs" : "px-2 py-1 text-xs"
      }`}
    >
      Crit!
    </button>
  );
}
