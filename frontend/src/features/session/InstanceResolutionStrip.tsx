// A compact per-instance strip for a multi-instance cast (Magic Missile's darts, Scorching Ray's
// rays, Eldritch Blast's beams, #1981/#1983) — rendered INSTEAD of ResolutionRail whenever
// view.instances is present, since the top-level toHit/effect fields ResolutionRail's step content
// reads are meaningless once a cast has N independent (or N fanned-out) rolls. Visual pattern
// borrowed from AttackTallyStrip (pending/hit/miss/crit chips + damage) but deliberately not
// importing it or its types — a resolution instance and a swing tally row are different shapes.

import AttackResultLine from "@/features/session/AttackResultLine";
import type { ResolutionInstanceView, ResolutionView } from "@/features/session/useResolution";

type Verdict = "hit" | "miss" | "crit";

const VERDICT_LABEL: Record<Verdict, string> = { hit: "Hit", miss: "Miss", crit: "Crit" };

const VERDICT_CHIP: Record<Verdict, string> = {
  hit: "border-arcane-300 bg-arcane-100 text-arcane-800",
  miss: "border-parchment-300 bg-parchment-200 text-parchment-600",
  crit: "border-garnet-300 bg-garnet-100 text-garnet-800",
};

function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`shrink-0 rounded-control border px-2 py-0.5 text-[10px] font-semibold ${VERDICT_CHIP[verdict]}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function VerdictButtons({ instance, disabled }: { instance: ResolutionInstanceView; disabled: boolean }) {
  return (
    <span className="flex shrink-0 gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={instance.onCallMiss}
        className="rounded-control border border-parchment-300 bg-parchment-50 px-1.5 py-0.5 text-[10px] font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Miss
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={instance.onCallCrit}
        className="rounded-control border border-garnet-200 bg-garnet-50 px-1.5 py-0.5 text-[10px] font-semibold text-garnet-800 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Crit!
      </button>
    </span>
  );
}

// The to-hit half of an attack-instanced row: pre-roll button, then unresolved verdict buttons, then
// a settled chip. Absent entirely for an auto-hit instanced row (hasToHit false, EachInstanceRow never renders this).
function ToHitArea({ instance, disabled }: { instance: ResolutionInstanceView; disabled: boolean }) {
  if (!instance.toHitRoll) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={instance.onRollToHit}
        className="min-h-9 shrink-0 rounded-control bg-garnet-soft-surface px-2.5 text-[11px] font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        Roll to hit
      </button>
    );
  }
  if (instance.verdict === undefined) {
    return <VerdictButtons instance={instance} disabled={disabled} />;
  }
  return <VerdictChip verdict={instance.verdict} />;
}

// The damage half of a roll:"each" row: a called miss shows nothing to roll, a landed roll renders
// via AttackResultLine, otherwise a Roll (crit) damage button — split out of EachInstanceRow (#1983 review).
function DamageArea({
  instance,
  missed,
  canRoll,
  damageType,
  disabled,
}: {
  instance: ResolutionInstanceView;
  missed: boolean;
  canRoll: boolean;
  damageType: string | undefined;
  disabled: boolean;
}) {
  if (missed) return <span className="text-[11px] text-parchment-500">Missed — no damage</span>;
  if (instance.effectRoll) return <AttackResultLine result={instance.effectRoll} kind="damage" damageType={damageType} />;
  if (!canRoll) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={instance.onRollEffect}
      className={`min-h-9 self-start rounded-control border px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        instance.isCrit
          ? "border-garnet-300 bg-garnet-100 text-garnet-800 hover:bg-garnet-200"
          : "border-parchment-300 bg-parchment-100 text-parchment-700 hover:bg-parchment-200"
      }`}
    >
      {instance.isCrit ? "Roll crit damage" : "Roll damage"}
    </button>
  );
}

// roll:"each" row — attack-instanced (own toHit/callIt/damage) or auto-hit-instanced (damage only).
function EachInstanceRow({
  instance,
  hasToHit,
  damageType,
  disabled,
}: {
  instance: ResolutionInstanceView;
  hasToHit: boolean;
  damageType: string | undefined;
  disabled: boolean;
}) {
  const missed = hasToHit && instance.verdict === "miss";
  // Matches the un-instanced rail's own DamageStepContent (#811): rolling damage is allowed the
  // moment the die lands, verdict called or not — rolling it IS the hit call for an unresolved roll.
  const canRollDamage = !missed;
  return (
    <li className={`flex flex-col gap-1.5 rounded-control border border-parchment-200 bg-parchment-50 p-2 ${missed ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-parchment-900">
          Instance {instance.index + 1}
        </span>
        {hasToHit && <ToHitArea instance={instance} disabled={disabled} />}
      </div>
      <DamageArea instance={instance} missed={missed} canRoll={canRollDamage} damageType={damageType} disabled={disabled} />
    </li>
  );
}

// roll:"once" row — no per-instance roll, just the shared roll's fanned-out (and possibly doubled) total plus a manual crit toggle.
function OnceInstanceRow({
  instance,
  damageType,
  disabled,
}: {
  instance: ResolutionInstanceView;
  damageType: string | undefined;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-control border border-parchment-200 bg-parchment-50 p-2">
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-parchment-900">
        Instance {instance.index + 1}
      </span>
      {instance.effectRoll ? (
        <AttackResultLine result={instance.effectRoll} kind="damage" damageType={damageType} />
      ) : (
        <span className="text-[11px] text-parchment-500">awaiting the shared roll</span>
      )}
      {instance.isCrit ? (
        <VerdictChip verdict="crit" />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={instance.onCallCrit}
          className="shrink-0 rounded-control border border-garnet-200 bg-garnet-50 px-1.5 py-0.5 text-[10px] font-semibold text-garnet-800 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Crit?
        </button>
      )}
    </li>
  );
}

function SharedRollRow({ view }: { view: ResolutionView }) {
  if (view.effectRoll) {
    return (
      <div className="flex items-center gap-2 rounded-control border border-parchment-300 bg-parchment-100 p-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">Shared roll</span>
        <AttackResultLine result={view.effectRoll} kind="damage" damageType={view.effect?.damageType} />
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={view.disabled}
      onClick={view.onRollEffect}
      className="min-h-11 w-full rounded-control bg-garnet-soft-surface px-3 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      Roll damage — applies to every instance
    </button>
  );
}

export default function InstanceResolutionStrip({
  view,
  completeLabel = "Confirm",
}: {
  view: ResolutionView;
  completeLabel?: string;
}) {
  const instances = view.instances;
  if (!instances || instances.length === 0) return null;

  const isOnce = view.instanceRoll === "once";
  const hasToHit = Boolean(view.toHit);
  const canComplete = !view.completed && view.readyToComplete;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-garnet-200 bg-parchment-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        {view.source} · {instances.length} instance{instances.length === 1 ? "" : "s"}
      </p>
      {isOnce && <SharedRollRow view={view} />}
      <ul className="flex flex-col gap-1.5">
        {instances.map((instance) =>
          isOnce ? (
            <OnceInstanceRow
              key={instance.index}
              instance={instance}
              damageType={view.effect?.damageType}
              disabled={view.disabled}
            />
          ) : (
            <EachInstanceRow
              key={instance.index}
              instance={instance}
              hasToHit={hasToHit}
              damageType={view.effect?.damageType}
              disabled={view.disabled}
            />
          ),
        )}
      </ul>
      {canComplete && (
        <button
          type="button"
          disabled={view.disabled}
          onClick={view.onComplete}
          title={view.disabled ? "No action economy remaining" : undefined}
          className="min-h-11 w-full rounded-control bg-garnet-soft-surface px-3 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {/* Mirrors ResolutionRail's CompleteButton: an instanced resolution always has at least one
              step (toHit/callIt/damage, or just damage), so the button reads "Done" rather than the
              caller's completeLabel — the same convention every un-instanced multi-step cast/swing uses. */}
          {view.steps.length === 0 ? completeLabel : "Done"}
        </button>
      )}
    </div>
  );
}
