// ResolutionRail (epic #1827 Slice 4, #1831) — generalizes AttackStepCard into
// a presentational rail that renders from a `ResolutionView` instead of the
// weapon-specific AttackEntryView/AttackTallyRow pair. AttackStepCard's own
// behavior/API is unchanged — the weapon adapter migrates its callers to this
// component and retires it in #1832; this is new, additive UI. The two share
// the numbered-dot rail shell and the verdict/crit widgets via
// `railPrimitives` (fallow-flagged clone, extracted rather than copied) —
// AttackStepCard's rendered output is byte-identical to before.
//
// The save/auto-hit/no-roll variants are just WHICH steps `view.steps` emits
// (design spec) — this component has no shape-specific branch of its own,
// only a switch over each step's `kind`. An empty step list (no-roll) renders
// no numbered steps at all, just the completion button every shape ends on.

import AttackResultLine from "@/features/session/AttackResultLine";
import { CritButton, RailStep, VerdictChip } from "@/features/session/railPrimitives";
import { abilityLabel } from "@/lib/abilities";
import type { ResolutionStep, ResolutionStepKind } from "@/lib/resolutionSteps";
import type { ResolutionView } from "@/features/session/useResolution";

const STEP_LABEL: Record<Exclude<ResolutionStepKind, "damage">, string> = {
  toHit: "Roll to hit",
  callIt: "Call it",
  announceSave: "Announce the save",
};

// The "damage" step's own label is keyed off view.effect?.kind (#1831
// review): a heal-shaped resolution (Cure Wounds) reads "Healing"/"Roll
// healing", never "Damage"/"Roll damage" — a flat STEP_LABEL entry can't
// branch on the view, so this is a function, not a table lookup.
function damageStepLabel(view: ResolutionView): string {
  return view.effect?.kind === "heal" ? "Healing" : "Damage";
}

function stepLabel(kind: ResolutionStepKind, view: ResolutionView): string {
  return kind === "damage" ? damageStepLabel(view) : STEP_LABEL[kind];
}

function ToHitStepContent({ view }: { view: ResolutionView }) {
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-semibold text-parchment-900">{view.source}</span>
        {!view.toHitRoll && (
          <button
            type="button"
            disabled={view.disabled}
            onClick={view.onRollToHit}
            title={view.disabled ? "No action economy remaining" : undefined}
            className="min-h-11 shrink-0 rounded-control bg-garnet-soft-surface px-3 text-xs font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Roll to hit
          </button>
        )}
      </div>
      {view.attackChip && (
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-parchment-500">
          {view.attackChip}
        </span>
      )}
      {view.toHitRoll && <AttackResultLine result={view.toHitRoll} kind="attack" />}
    </div>
  );
}

function CallItStepContent({ view }: { view: ResolutionView }) {
  const attack = view.attack;
  if (!attack) return null;
  if (attack.criticalHit) {
    return <VerdictChip tone="crit">Critical hit! — nat {attack.keptFace}</VerdictChip>;
  }
  if (attack.nat1) return <VerdictChip tone="miss">Miss — nat 1</VerdictChip>;
  if (view.verdict === undefined) {
    return (
      <>
        <p className="text-sm text-parchment-700">
          Does <span className="font-semibold tabular-nums">{attack.total}</span> hit? Ask your DM.
        </p>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={view.onCallMiss}
            disabled={view.disabled}
            className="min-h-11 flex-1 rounded-control border border-parchment-300 bg-parchment-50 px-3 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            it Missed
          </button>
          <CritButton onCallCrit={view.onCallCrit} disabled={view.disabled} tall />
        </div>
      </>
    );
  }
  if (view.verdict === "crit") return <VerdictChip tone="crit">Crit!</VerdictChip>;
  if (view.verdict === "miss") return <VerdictChip tone="miss">Miss</VerdictChip>;
  return (
    <div className="flex items-center gap-2">
      <VerdictChip tone="hit">✓ Hit</VerdictChip>
      <CritButton onCallCrit={view.onCallCrit} disabled={view.disabled} />
    </div>
  );
}

function AnnounceSaveStepContent({ view }: { view: ResolutionView }) {
  const save = view.save;
  if (!save) return null;
  return (
    <p className="mt-1 text-sm text-parchment-700">
      DC <span className="font-semibold tabular-nums">{save.dc}</span> {abilityLabel(save.ability)} save
    </p>
  );
}

// crit doubling only ever applies to a damage roll (never a heal — see
// useResolution's isCrit/critDamageSpec, which a heal-shaped resolution has
// no toHit die to ever set), but this still branches on view.effect?.kind
// first so "Roll healing" never momentarily reads "Roll crit healing".
function damageButtonLabel(view: ResolutionView): string {
  if (view.effect?.kind === "heal") return "Roll healing";
  return view.isCrit ? "Roll crit damage" : "Roll damage";
}

function DamageStepContent({ view }: { view: ResolutionView }) {
  const missed = view.toHit !== undefined && view.verdict === "miss";
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-parchment-600">
          {missed ? "Missed — no damage" : view.source}
        </span>
        {!view.effectRoll && !missed && (
          <button
            type="button"
            disabled={view.disabled}
            onClick={view.onRollEffect}
            className={`min-h-11 shrink-0 rounded-control border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              view.isCrit
                ? "border-garnet-300 bg-garnet-100 text-garnet-800 hover:bg-garnet-200"
                : "border-parchment-300 bg-parchment-100 text-parchment-700 hover:bg-parchment-200"
            }`}
          >
            {damageButtonLabel(view)}
          </button>
        )}
      </div>
      {view.effectRoll && (
        <AttackResultLine
          result={view.effectRoll}
          kind="damage"
          damageType={view.effect?.damageType}
        />
      )}
    </div>
  );
}

function stepContent(step: ResolutionStep, view: ResolutionView): React.ReactNode {
  switch (step.kind) {
    case "toHit":
      return <ToHitStepContent view={view} />;
    case "callIt":
      return <CallItStepContent view={view} />;
    case "announceSave":
      return <AnnounceSaveStepContent view={view} />;
    case "damage":
      return <DamageStepContent view={view} />;
  }
}

/** The completion tap every shape ends on: "Resolve" for a no-roll
 *  resolution (nothing was rolled — this IS the whole interaction), "Done"
 *  once every real step is settled. Hidden once `completed`. */
function CompleteButton({ view }: { view: ResolutionView }) {
  if (view.completed) return null;
  if (!view.readyToComplete) return null;
  return (
    <button
      type="button"
      disabled={view.disabled}
      onClick={view.onComplete}
      title={view.disabled ? "No action economy remaining" : undefined}
      className="min-h-11 w-full rounded-control bg-garnet-soft-surface px-3 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {view.steps.length === 0 ? "Resolve" : "Done"}
    </button>
  );
}

export default function ResolutionRail({ view }: { view: ResolutionView }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-garnet-200 bg-parchment-50 p-3">
      {view.steps.length > 0 && (
        <div className="flex flex-col">
          {view.steps.map((step, i) => (
            <RailStep
              key={step.kind}
              number={i + 1}
              state={step.state}
              label={stepLabel(step.kind, view)}
              last={i === view.steps.length - 1}
            >
              {stepContent(step, view)}
            </RailStep>
          ))}
        </div>
      )}
      <CompleteButton view={view} />
    </div>
  );
}
