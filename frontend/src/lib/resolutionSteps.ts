import { stepRail, type StepState } from "@/lib/attackStepRail";
import type { TallyVerdict } from "@/lib/attackTallySummary";
import type { RollResult } from "@/lib/dice";
import type { TurnResolution } from "@character-sheet/shared-types";

export type ResolutionStepKind = "toHit" | "callIt" | "announceSave" | "damage";

export interface ResolutionStep {
  kind: ResolutionStepKind;
  state: StepState;
  settled: boolean;
}

/** One instance's roll state within an instanced resolution's `instances` — same shape as the top-level `ResolutionRollState` fields, just scoped to one dart/ray/beam. */
export interface InstanceRollState {
  toHit: RollResult | null;
  verdict: TallyVerdict | undefined;
  effect: RollResult | null;
}

export interface ResolutionRollState {
  toHit: RollResult | null;
  verdict: TallyVerdict | undefined;
  effect: RollResult | null;
  /** Present only for an instanced resolution with roll:"each" — read by `computeResolutionSteps`'s per-instance branch. A roll:"once" resolution (2014 Magic Missile) has no toHit of its own and reuses the un-instanced `effect`-only branch below unchanged, since its damage is one shared roll. */
  instances?: InstanceRollState[];
}

function stepState(done: boolean, blockedOnPrior: boolean): StepState {
  if (blockedOnPrior) return "pending";
  return done ? "done" : "active";
}

// Attack-instanced (Scorching Ray, Eldritch Blast) — the SAME three step kinds the un-instanced
// rail uses, aggregated over every instance: a step is "done" only once EVERY instance has cleared
// it. Split out of perInstanceSteps to keep each half under fallow's cognitive-complexity threshold.
function perInstanceAttackSteps(hasEffect: boolean, instances: InstanceRollState[]): ResolutionStep[] {
  const allRolled = instances.length > 0 && instances.every((i) => i.toHit !== null);
  const allCalled = instances.length > 0 && instances.every((i) => i.verdict !== undefined);
  const allDamageSettled = instances.every((i) => i.verdict === "miss" || i.effect !== null);

  const steps: ResolutionStep[] = [
    { kind: "toHit", state: stepState(allRolled, false), settled: allRolled },
    { kind: "callIt", state: stepState(allCalled, !allRolled), settled: allCalled },
  ];
  if (hasEffect) {
    steps.push({ kind: "damage", state: stepState(allDamageSettled, !allCalled), settled: allDamageSettled });
  }
  return steps;
}

// Auto-hit instanced, roll:"each" (2024 Magic Missile) — no toHit/callIt, each dart rolls its own damage.
function perInstanceAutoHitSteps(instances: InstanceRollState[]): ResolutionStep[] {
  const allRolled = instances.length > 0 && instances.every((i) => i.effect !== null);
  return [{ kind: "damage", state: stepState(allRolled, false), settled: allRolled }];
}

// Only reached for roll:"each" (attack-instanced Scorching Ray/Eldritch Blast, or auto-hit-instanced
// 2024 Magic Missile) — roll:"once" never calls this (see isPerInstanceEach).
function perInstanceSteps(
  resolution: Pick<TurnResolution, "toHit" | "effect">,
  instances: InstanceRollState[],
): ResolutionStep[] {
  return resolution.toHit
    ? perInstanceAttackSteps(Boolean(resolution.effect), instances)
    : perInstanceAutoHitSteps(instances);
}

// An attack-instanced cast always resolves per instance regardless of roll granularity (there's only
// one seeded roll:"each" case for it today); an auto-hit instanced cast only does when roll:"each"
// (2024 Magic Missile) — roll:"once" (2014 Magic Missile) has no toHit and reuses the un-instanced
// effect-only branch below unchanged, since its damage is one shared roll. Pulled into its own
// function (not an inline compound condition) so the caller's own complexity stays low.
export function isPerInstanceEach(resolution: Pick<TurnResolution, "toHit" | "instances">): boolean {
  return Boolean(resolution.instances && (resolution.toHit || resolution.instances.roll === "each"));
}

export function computeResolutionSteps(
  resolution: Pick<TurnResolution, "toHit" | "save" | "effect" | "instances">,
  state: ResolutionRollState,
): ResolutionStep[] {
  if (isPerInstanceEach(resolution)) {
    return perInstanceSteps(resolution, state.instances ?? []);
  }

  if (resolution.toHit) {
    const rail = stepRail({
      hasRoll: state.toHit !== null,
      verdict: state.verdict,
      hasDamage: state.effect !== null,
    });
    const steps: ResolutionStep[] = [
      { kind: "toHit", state: rail.rollToHit, settled: rail.rollToHit === "done" },
      { kind: "callIt", state: rail.callIt, settled: rail.callIt === "done" },
    ];
    if (resolution.effect) {
      steps.push({ kind: "damage", state: rail.damage, settled: rail.damageSettled });
    }
    return steps;
  }

  if (resolution.save) {
    const steps: ResolutionStep[] = [{ kind: "announceSave", state: "done", settled: true }];
    if (resolution.effect) {
      const rolled = state.effect !== null;
      steps.push({ kind: "damage", state: rolled ? "done" : "active", settled: rolled });
    }
    return steps;
  }

  if (resolution.effect) {
    const rolled = state.effect !== null;
    return [{ kind: "damage", state: rolled ? "done" : "active", settled: rolled }];
  }

  return [];
}

export function resolutionComplete(steps: ResolutionStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.settled);
}

export function resolutionReady(steps: ResolutionStep[]): boolean {
  return steps.length === 0 || resolutionComplete(steps);
}
