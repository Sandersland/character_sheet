// The single attack card (#811): one numbered step rail — Roll to hit → Call it
// → Damage — replacing the separate AttackFormCard + WeaponDamageCard pair.
// Verdict flow: rolling damage is an implicit hit; "it Missed" / "Crit!" sit on
// the to-hit result line; nat 20 / nat 1 lock the call. A miss resets the card
// for the next attack; a hit keeps it expanded with a full-width continue
// button. The quiet Skip link is the ungated path that leaves a row unresolved.
// Each step's branching lives in its own subcomponent; AttackStepCard is
// composition only.

import Segmented from "@/components/ui/Segmented";
import AttackResultLine from "@/features/session/AttackResultLine";
import DamageRiderList from "@/features/session/DamageRiderList";
import { stepRail, type StepRailModel, type StepState } from "@/lib/attackStepRail";
import { isUnresolvedRow } from "@/lib/attackTallySummary";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { AttackState } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { AttackEntry } from "@/lib/attackMath";
import type { RollMode } from "@/lib/dice";

interface AttackStepCardProps {
  forms: AttackEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** View for the currently-selected form — drives the summary + roll button. */
  selectedView: AttackEntryView;
  /** View bound to the last-rolled form — drives steps 2–3; null = not rolled yet. */
  boundView: AttackEntryView | null;
  /** The bound attack's tally row (verdict/damage state), when one exists. */
  currentRow: AttackTallyRow | null;
  attack: AttackState | null;
  attacksExhausted: boolean;
  onRollToHit: () => void;
  /** "it Missed" — writes the miss verdict and re-arms the next attack. */
  onCallMiss: () => void;
  /** "Crit!" — writes the crit verdict (doubles damage dice / doubled re-roll). */
  onCallCrit: () => void;
  /** Quiet skip — leaves the current row unresolved and re-arms the next attack. */
  onSkip: () => void;
  /** Last rolled total per on-hit rider id (from useAttackRolls), shown inline. */
  riderTotals: Record<string, number>;
  /** Kicker + pips in-card (mobile); the md+ layout hosts them in the rail instead. */
  showKicker: boolean;
}

const DOT_STYLE: Record<StepState, string> = {
  done: "border-garnet-600 bg-garnet-600 text-parchment-50",
  active: "border-garnet-600 bg-parchment-50 text-garnet-700",
  pending: "border-parchment-300 bg-parchment-50 text-parchment-400",
};

const LABEL_STYLE: Record<StepState, string> = {
  done: "text-parchment-600",
  active: "text-parchment-900",
  pending: "text-parchment-400",
};

/** One rail step: numbered dot + connector, label, and the step's content. */
function Step({
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

/** "Attacks · N of M remaining" kicker with spent/remaining pips (total > 1 only). */
export function AttackKickerPips({ attack }: { attack: AttackState | null }) {
  if (!attack || attack.total <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {Array.from({ length: attack.total }).map((_, i) => (
          <span
            key={i}
            className={`inline-block h-2 w-2 rounded-full ${
              i < attack.used ? "bg-parchment-300" : "bg-garnet-600"
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

function attackOrdinalLabel(attack: AttackState | null): string {
  if (!attack || attack.total <= 1 || attack.used === 0) return "Roll to hit";
  return `Roll to hit — attack ${attack.used + 1} of ${attack.total}`;
}

/** Small verdict chip (nat-locked calls, ✓ Hit, Crit!, Miss). */
function VerdictChip({ tone, children }: { tone: "crit" | "miss" | "hit"; children: React.ReactNode }) {
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

/** The small garnet "Crit!" call/upgrade button. */
function CritButton({ onCallCrit, tall = false }: { onCallCrit: () => void; tall?: boolean }) {
  return (
    <button
      type="button"
      onClick={onCallCrit}
      className={`rounded-control border border-garnet-200 bg-garnet-50 font-semibold text-garnet-800 transition-colors hover:bg-garnet-100 ${
        tall ? "min-h-11 flex-1 px-3 text-xs" : "px-2 py-1 text-xs"
      }`}
    >
      Crit!
    </button>
  );
}

/** Selected-form summary: name + magical badge, to-hit/damage labels, and the
 *  state-driven roll-mode chip (#486) — colored by the resolved mode. */
function SelectedFormSummary({
  selected,
  chip,
  mode,
}: {
  selected: AttackEntry;
  chip: string;
  mode: RollMode;
}) {
  const chipColor =
    mode === "advantage" ? "text-gold-600" : mode === "disadvantage" ? "text-garnet-600" : "text-parchment-500";
  return (
    <span className="min-w-0 flex-1">
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
      {chip && (
        <span
          data-testid="attack-roll-mode-chip"
          className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-wide ${chipColor}`}
        >
          {chip}
        </span>
      )}
    </span>
  );
}

/** Step 1 content: form selector, selected-form summary, roll button, result line. */
function RollToHitStep({
  forms,
  selectedId,
  onSelect,
  selected,
  chip,
  mode,
  boundView,
  attack,
  attacksExhausted,
  onRollToHit,
}: {
  forms: AttackEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  selected: AttackEntry;
  chip: string;
  mode: RollMode;
  boundView: AttackEntryView | null;
  attack: AttackState | null;
  attacksExhausted: boolean;
  onRollToHit: () => void;
}) {
  const options = forms.map((f) => ({ value: f.id, label: f.name }));
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {forms.length > 1 && (
        <Segmented label="Attacking with" options={options} value={selectedId} onChange={onSelect} />
      )}
      <div className="flex items-center gap-2">
        <SelectedFormSummary selected={selected} chip={chip} mode={mode} />
        {!boundView && (
          <button
            type="button"
            disabled={attacksExhausted}
            onClick={onRollToHit}
            title={attacksExhausted ? "No attacks remaining" : undefined}
            className="min-h-11 shrink-0 rounded-control bg-garnet-600 px-3 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {attackOrdinalLabel(attack)}
          </button>
        )}
      </div>
      {boundView?.lastAttackRoll && (
        <AttackResultLine
          result={boundView.lastAttackRoll}
          kind="attack"
          overrideTotal={boundView.attackTotal}
        />
      )}
    </div>
  );
}

/** Step 2 content: the verdict call — question + buttons, or the settled chip. */
function CallItStep({
  row,
  effectiveToHit,
  onCallMiss,
  onCallCrit,
}: {
  row: AttackTallyRow;
  effectiveToHit: number | null | undefined;
  onCallMiss: () => void;
  onCallCrit: () => void;
}) {
  if (row.attack.nat20) return <VerdictChip tone="crit">Critical hit! — nat 20</VerdictChip>;
  if (row.attack.nat1) return <VerdictChip tone="miss">Miss — nat 1</VerdictChip>;
  if (isUnresolvedRow(row)) {
    return (
      <>
        <p className="text-sm text-parchment-700">
          Does <span className="font-semibold tabular-nums">{effectiveToHit}</span> hit? Ask your
          DM.
        </p>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={onCallMiss}
            className="min-h-11 flex-1 rounded-control border border-parchment-300 bg-parchment-50 px-3 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            it Missed
          </button>
          <CritButton onCallCrit={onCallCrit} tall />
        </div>
      </>
    );
  }
  if (row.verdict === "crit") return <VerdictChip tone="crit">Crit!</VerdictChip>;
  if (row.verdict === "miss") return <VerdictChip tone="miss">Miss</VerdictChip>;
  return (
    <div className="flex items-center gap-2">
      <VerdictChip tone="hit">✓ Hit</VerdictChip>
      <CritButton onCallCrit={onCallCrit} />
    </div>
  );
}

/** Damage-button label: filled → re-roll with the shown total, else by crit state. */
function damageButtonLabel(boundView: AttackEntryView | null, crit: boolean): string {
  const filledTotal = boundView?.lastDamageRoll
    ? boundView.damageTotal ?? boundView.lastDamageRoll.total
    : undefined;
  if (filledTotal != null) return `Re-roll ${crit ? "crit " : ""}damage (${filledTotal})`;
  return crit ? "Roll crit damage" : "Roll damage";
}

/** The muted copy beside the damage button when it isn't (or can't be) armed. */
function damageStepCopy(boundView: AttackEntryView | null, missed: boolean): string {
  if (boundView) return `${boundView.entry.name} · ${boundView.entry.damageLabel}`;
  return missed ? "Missed — no damage" : "Roll to hit first — then roll damage";
}

/** Step 3 content: the damage roll row, result line, and on-hit riders. */
function DamageStep({
  boundView,
  missed,
  armed,
  crit,
  riderTotals,
}: {
  boundView: AttackEntryView | null;
  missed: boolean;
  armed: boolean;
  crit: boolean;
  riderTotals: Record<string, number>;
}) {
  const label = damageButtonLabel(boundView, crit);
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-parchment-600">
          {damageStepCopy(boundView, missed)}
        </span>
        <button
          type="button"
          disabled={!armed}
          onClick={boundView?.onDamage}
          className={`min-h-11 shrink-0 rounded-control border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            crit
              ? "border-garnet-300 bg-garnet-100 text-garnet-800 hover:bg-garnet-200"
              : "border-parchment-300 bg-parchment-100 text-parchment-700 hover:bg-parchment-200"
          }`}
        >
          {label}
        </button>
      </div>
      {boundView?.lastDamageRoll && (
        <AttackResultLine
          result={boundView.lastDamageRoll}
          kind="damage"
          damageType={boundView.entry.damageType}
          overrideTotal={boundView.damageTotal}
        />
      )}
      {boundView && (
        <DamageRiderList
          riders={boundView.entry.damageRiders}
          riderTotals={riderTotals}
          onDamageRider={boundView.onDamageRider}
        />
      )}
    </div>
  );
}

/** Post-roll continuation: quiet Skip while unresolved, full-width continue once called. */
function ContinueOrSkip({
  unresolved,
  attack,
  onRollToHit,
  onSkip,
}: {
  unresolved: boolean;
  attack: AttackState | null;
  onRollToHit: () => void;
  onSkip: () => void;
}) {
  if (unresolved) {
    return (
      <button
        type="button"
        onClick={onSkip}
        className="self-start text-xs font-semibold text-parchment-500 transition-colors hover:text-parchment-700"
      >
        Skip — roll next attack ›
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onRollToHit}
      className="min-h-11 w-full rounded-control bg-garnet-600 px-3 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-700"
    >
      {attackOrdinalLabel(attack)}
    </button>
  );
}

// The card before any roll binds it: step 1 armed, everything else parked.
const UNBOUND_CARD = {
  row: null as AttackTallyRow | null,
  rail: stepRail({ hasRoll: false, verdict: undefined, hasDamage: false }),
  unresolved: false,
  missed: false,
  damageArmed: false,
  crit: false,
  effectiveToHit: undefined as number | null | undefined,
};

// Per-render card model: steps 2–3 read the bound (last-rolled) form; the
// parent clears the binding after a miss so the card re-arms even though the
// tally row remains. The tally row (when live state provides one) carries the
// verdict. Pure — extracted so the component itself is composition only.
function cardModel(boundView: AttackEntryView | null, currentRow: AttackTallyRow | null) {
  if (!boundView) return UNBOUND_CARD;
  const row = currentRow;
  const verdict = row?.verdict;
  const hasDamage = Boolean(boundView.lastDamageRoll) || row?.damage !== undefined;
  const rail: StepRailModel = stepRail({ hasRoll: true, verdict, hasDamage });
  return {
    row,
    rail,
    unresolved: row !== null && isUnresolvedRow(row),
    missed: verdict === "miss",
    damageArmed: rail.damage !== "pending",
    crit: boundView.isCrit,
    effectiveToHit: boundView.attackTotal ?? row?.attack.total,
  };
}

export default function AttackStepCard({
  forms,
  selectedId,
  onSelect,
  selectedView,
  boundView,
  currentRow,
  attack,
  attacksExhausted,
  onRollToHit,
  onCallMiss,
  onCallCrit,
  onSkip,
  riderTotals,
  showKicker,
}: AttackStepCardProps) {
  const { row, rail, unresolved, missed, damageArmed, crit, effectiveToHit } = cardModel(
    boundView,
    currentRow,
  );

  return (
    <div className="flex flex-col gap-3 rounded-card border border-garnet-200 bg-parchment-50 p-3">
      {showKicker && <AttackKickerPips attack={attack} />}

      <div className="flex flex-col">
        <Step number={1} state={rail.rollToHit} label="Roll to hit">
          <RollToHitStep
            forms={forms}
            selectedId={selectedId}
            onSelect={onSelect}
            selected={selectedView.entry}
            chip={selectedView.attackChip}
            mode={selectedView.attackMode}
            boundView={boundView}
            attack={attack}
            attacksExhausted={attacksExhausted}
            onRollToHit={onRollToHit}
          />
        </Step>

        <Step number={2} state={rail.callIt} label="Call it">
          {row && (
            <div className="mt-1">
              <CallItStep
                row={row}
                effectiveToHit={effectiveToHit}
                onCallMiss={onCallMiss}
                onCallCrit={onCallCrit}
              />
            </div>
          )}
        </Step>

        <Step number={3} state={rail.damage} label="Damage" last>
          <DamageStep
            boundView={boundView}
            missed={missed}
            armed={damageArmed}
            crit={crit}
            riderTotals={riderTotals}
          />
        </Step>
      </div>

      {boundView && !attacksExhausted && (
        <ContinueOrSkip
          unresolved={unresolved}
          attack={attack}
          onRollToHit={onRollToHit}
          onSkip={onSkip}
        />
      )}
    </div>
  );
}
