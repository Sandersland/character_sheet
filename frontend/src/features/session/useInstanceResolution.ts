// Split out of useResolution (#1983 review — kept the hook under fallow's cognitive-complexity
// threshold): everything specific to a multi-instance cast's darts/rays/beams — roll:"each" state
// per instance, roll:"once" (2014 Magic Missile) shared-roll fan-out, and the commit-time event
// builder. useResolution still owns the single top-level toHit/effect roll (reused verbatim for
// roll:"once", see isPerInstanceEach's own comment) and threads this hook's output into its own view.

import { useState } from "react";

import { critDamageSpec } from "@/lib/attackMath";
import { autoVerdict, isDieLocked, toHitSnapshot } from "@/lib/attackTallySummary";
import { buildEffectEvent, buildToHitEvent as buildToHitEventShared, doubleRollForOnceModeCrit } from "@/lib/resolutionEvents";
import { isPerInstanceEach } from "@/lib/resolutionSteps";
import type { InstanceRollState } from "@/lib/resolutionSteps";
import type { TallyAttackRoll, TallyVerdict } from "@/lib/attackTallySummary";
import type { RollMode, RollResult, RollSpec } from "@/lib/dice";
import type { ResolutionInstanceView } from "@/features/session/useResolution";
import type { ResolveActionEventInstance, ResolveActionEventToHit, TurnResolution } from "@character-sheet/shared-types";

/** One instance's live roll state (dart/ray/beam) — same shape as useResolution's own ToHitState/effectRoll, scoped per index. Absent `attack`/`modifier` when no toHit ever landed (auto-hit instances). */
interface InstanceState {
  toHit: RollResult | null;
  attack: TallyAttackRoll | null;
  verdict: TallyVerdict | undefined;
  effect: RollResult | null;
  modifier: number;
}

const EMPTY_INSTANCE_STATE: InstanceState = { toHit: null, attack: null, verdict: undefined, effect: null, modifier: 0 };

// No instance ever gets the #1844 external to-hit boost, so this thin wrapper over the shared
// buildToHitEvent always passes boost 0 and never throws (verdict is checked by the caller first).
function buildToHitEvent(inst: InstanceState, descriptor: NonNullable<TurnResolution["toHit"]>): ResolveActionEventToHit {
  return buildToHitEventShared({ result: inst.toHit!, attack: inst.attack!, verdict: inst.verdict, modifier: inst.modifier }, descriptor);
}

export interface UseInstanceResolutionArgs {
  resolution: TurnResolution;
  resolvedAttack: { mode: RollMode; modifier: number };
  roll: (spec: RollSpec, label: string) => RollResult;
  disabled: boolean;
  completed: boolean;
  /** The shared roll:"once" damage roll, owned by useResolution's own top-level effect state (reused verbatim, never re-derived here). */
  sharedEffectRoll: RollResult | null;
}

export interface UseInstanceResolutionResult {
  usesPerInstanceEach: boolean;
  instanceStateList: InstanceRollState[];
  instances: ResolutionInstanceView[] | undefined;
  buildInstanceEvents: () => ResolveActionEventInstance[];
  reset: () => void;
}

export function useInstanceResolution({
  resolution,
  resolvedAttack,
  roll,
  disabled,
  completed,
  sharedEffectRoll,
}: UseInstanceResolutionArgs): UseInstanceResolutionResult {
  const [instanceRolls, setInstanceRolls] = useState<Record<number, InstanceState>>({});
  /** roll:"once" only (2014 Magic Missile) — a manual per-instance crit flag; there's no per-instance die to lock, so this toggles freely until commit. */
  const [onceCrits, setOnceCrits] = useState<Record<number, boolean>>({});

  const instanceSpec = resolution.instances;
  const instanceCount = instanceSpec?.count ?? 0;
  const usesPerInstanceEach = isPerInstanceEach(resolution);
  const usesOnceMode = Boolean(instanceSpec && instanceSpec.roll === "once");

  const instanceStateList: InstanceRollState[] = usesPerInstanceEach
    ? Array.from({ length: instanceCount }, (_, i) => instanceRolls[i] ?? EMPTY_INSTANCE_STATE)
    : [];

  function onRollToHitInstance(i: number) {
    if (disabled || completed || !resolution.toHit || (instanceRolls[i] ?? EMPTY_INSTANCE_STATE).toHit) return;
    const spec: RollSpec = {
      count: 1,
      faces: 20,
      modifier: resolution.toHit.bonus + resolvedAttack.modifier,
      mode: resolvedAttack.mode,
    };
    const result = roll(spec, `${resolution.source} attack — instance ${i + 1}`);
    const attack = toHitSnapshot(result, resolution.toHit.critRange);
    // Spreads any prior state instead of replacing it wholesale — the strip lets a player roll this
    // instance's damage before its to-hit (see onRollEffectInstance's own comment), and this must not
    // discard that already-rolled damage out from under them.
    setInstanceRolls((prev) => ({
      ...prev,
      [i]: { ...(prev[i] ?? EMPTY_INSTANCE_STATE), toHit: result, attack, verdict: autoVerdict(attack), modifier: resolvedAttack.modifier },
    }));
  }

  function onCallMissInstance(i: number) {
    const inst = instanceRolls[i];
    if (disabled || completed || !inst || inst.verdict !== undefined) return;
    setInstanceRolls((prev) => ({ ...prev, [i]: { ...prev[i], verdict: "miss" } }));
  }

  function onCallCritInstance(i: number) {
    const inst = instanceRolls[i];
    if (disabled || completed || !inst || inst.effect) return;
    if (inst.verdict === "miss") return;
    if (inst.attack && isDieLocked(inst.attack) && inst.verdict !== "crit") return;
    setInstanceRolls((prev) => ({ ...prev, [i]: { ...prev[i], verdict: "crit" } }));
  }

  function canRollInstanceEffect(inst: InstanceState, hasToHit: boolean): boolean {
    if (disabled || completed || !resolution.effect || inst.effect) return false;
    return !(hasToHit && inst.verdict === "miss");
  }

  // Auto-hit instances (no resolution.toHit) never get a "hit" verdict — they have no hit/miss
  // concept — so `inst.verdict` passes through unchanged for them.
  function impliedInstanceVerdict(inst: InstanceState, hasToHit: boolean): TallyVerdict | undefined {
    return hasToHit ? (inst.verdict ?? "hit") : inst.verdict;
  }

  // Rolling damage IS the hit call (#811, mirrored per instance) — an unset verdict resolves to "hit"
  // the moment damage lands, computed and written in the SAME setInstanceRolls call (unlike
  // useResolution's own top-level resolveImplicitHit, which is a separate stale-closure-read follow-up
  // call — that pattern breaks here: the strip lets a player roll an instance's damage before ever
  // rolling ITS to-hit, i.e. before instanceRolls[i] exists at all, and a follow-up read of the still-stale
  // outer `instanceRolls[i]` would find nothing to update, permanently stranding that instance's verdict
  // and softlocking the cast). `prev[i] ?? EMPTY_INSTANCE_STATE` guards the same never-rolled-yet case
  // inside the updater itself.
  function onRollEffectInstance(i: number) {
    const inst = instanceRolls[i] ?? EMPTY_INSTANCE_STATE;
    const hasToHit = Boolean(resolution.toHit);
    if (!canRollInstanceEffect(inst, hasToHit)) return;
    const spec = inst.verdict === "crit" ? critDamageSpec(resolution.effect!.spec as RollSpec) : (resolution.effect!.spec as RollSpec);
    const result = roll(spec, `${resolution.source} damage — instance ${i + 1}`);
    const verdict = impliedInstanceVerdict(inst, hasToHit);
    setInstanceRolls((prev) => ({ ...prev, [i]: { ...(prev[i] ?? EMPTY_INSTANCE_STATE), effect: result, verdict } }));
  }

  // roll:"once" only — flags this instance as a DM-ruled crit; there's no per-instance die to lock (no
  // toHit exists for an auto-hit instance), so this toggles freely — on and back off — until commit,
  // the same as the un-instanced rail lets you re-call a non-die-locked verdict. The shared roll never
  // re-rolls; doubling its dice subtotal for display/commit is doubleRollForOnceModeCrit's job (dice
  // only, never the modifier — see that function's own comment for the 5e citation).
  function onCallCritOnce(i: number) {
    if (disabled || completed) return;
    setOnceCrits((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function onceInstanceView(i: number, sharedEffectRoll: RollResult | null): ResolutionInstanceView {
    const crit = Boolean(onceCrits[i]);
    const displayRoll = crit && sharedEffectRoll ? doubleRollForOnceModeCrit(sharedEffectRoll) : sharedEffectRoll;
    return {
      index: i,
      toHitRoll: null,
      attack: null,
      verdict: crit ? "crit" : undefined,
      isCrit: crit,
      effectRoll: displayRoll,
      onRollToHit: () => {},
      onCallMiss: () => {},
      onCallCrit: () => onCallCritOnce(i),
      onRollEffect: () => {},
    };
  }

  function eachInstanceView(i: number): ResolutionInstanceView {
    const inst = instanceRolls[i] ?? EMPTY_INSTANCE_STATE;
    return {
      index: i,
      toHitRoll: inst.toHit,
      attack: inst.attack,
      verdict: inst.verdict,
      isCrit: inst.verdict === "crit",
      effectRoll: inst.effect,
      onRollToHit: () => onRollToHitInstance(i),
      onCallMiss: () => onCallMissInstance(i),
      onCallCrit: () => onCallCritInstance(i),
      onRollEffect: () => onRollEffectInstance(i),
    };
  }

  function buildOnceInstanceEvents(): ResolveActionEventInstance[] {
    if (!resolution.effect || !sharedEffectRoll || !instanceSpec) return [];
    const base = buildEffectEvent(sharedEffectRoll, resolution.effect, false);
    const critEffect = buildEffectEvent(doubleRollForOnceModeCrit(sharedEffectRoll), resolution.effect, true);
    return Array.from({ length: instanceSpec.count }, (_, i) => ({
      effect: onceCrits[i] ? critEffect : base,
    }));
  }

  // Every element carries a toHit or an effect (never neither) — resolveActionInstanceSchema's own
  // refine (f70e1279) rejects a hollow `{}` instance, and readyToComplete already guarantees each
  // instance settled (attack-instanced: toHit rolled + verdict called; auto-hit: effect rolled)
  // before onComplete can ever reach this, so the filter below should never actually drop anything —
  // it exists so a hollow instance is structurally impossible to send rather than trusted to not occur.
  function buildEachInstanceEvents(): ResolveActionEventInstance[] {
    if (!instanceSpec) return [];
    return Array.from({ length: instanceSpec.count }, (_, i) => {
      const inst = instanceRolls[i] ?? EMPTY_INSTANCE_STATE;
      const toHitEvt = resolution.toHit && inst.toHit && inst.verdict !== undefined ? buildToHitEvent(inst, resolution.toHit) : null;
      const effectEvt = resolution.effect && inst.effect ? buildEffectEvent(inst.effect, resolution.effect, inst.verdict === "crit") : null;
      return { ...(toHitEvt ? { toHit: toHitEvt } : {}), ...(effectEvt ? { effect: effectEvt } : {}) };
    }).filter((entry) => entry.toHit != null || entry.effect != null);
  }

  function buildInstanceEvents(): ResolveActionEventInstance[] {
    return usesOnceMode ? buildOnceInstanceEvents() : buildEachInstanceEvents();
  }

  function reset() {
    setInstanceRolls({});
    setOnceCrits({});
  }

  const instances: ResolutionInstanceView[] | undefined = instanceSpec
    ? Array.from({ length: instanceCount }, (_, i) => (usesOnceMode ? onceInstanceView(i, sharedEffectRoll) : eachInstanceView(i)))
    : undefined;

  return { usesPerInstanceEach, instanceStateList, instances, buildInstanceEvents, reset };
}
