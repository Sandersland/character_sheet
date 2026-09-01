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

// Shared by ResolutionRail and InstanceResolutionStrip (#1983 review — was duplicated verbatim
// between the two) — an instanced or un-instanced resolution both always have at least one step
// (toHit/callIt/damage, or just damage), so the button reads "Done" rather than the caller's own
// completeLabel — the same convention every multi-step cast/swing uses either way.
export function CompleteButton({ view, completeLabel }: { view: ResolutionView; completeLabel: string }) {
  return (
    <button
      type="button"
      disabled={view.disabled}
      onClick={view.onComplete}
      title={view.disabled ? "No action economy remaining" : undefined}
      className="min-h-11 w-full rounded-control bg-garnet-soft-surface px-3 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {view.steps.length === 0 ? completeLabel : "Done"}
    </button>
  );
}
