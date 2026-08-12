// Pure step-list model for the unified resolver's rail (epic #1827, #1831):
// generalizes attackStepRail's fixed 3-slot {rollToHit, callIt, damage} shape
// (weapons only) into an ORDERED, shape-dependent step list any TurnResolution
// can drive — a weapon swing / attack-roll spell reuses `stepRail` verbatim
// (its 3-slot semantics fit exactly), while the save / auto-hit / no-roll
// shapes are just fewer, simpler steps (design spec: "the save/auto-hit/
// no-roll variants are just WHICH steps the view emits" — not new components).
//
// Which steps appear is read straight off the descriptor's own optional
// fields (`toHit`/`save`/`effect`) — no separate "shape" enum to keep in sync
// with TurnResolution (turn-resolution.ts's own docstring: "toHit/save are
// mutually exclusive by shape").

import { stepRail, type StepState } from "@/lib/attackStepRail";
import type { TallyVerdict } from "@/lib/attackTallySummary";
import type { RollResult } from "@/lib/dice";
import type { TurnResolution } from "@character-sheet/shared-types";

export type ResolutionStepKind = "toHit" | "callIt" | "announceSave" | "damage";

export interface ResolutionStep {
  kind: ResolutionStepKind;
  state: StepState;
}

/** The resolver's live roll state — just enough to derive step states. */
export interface ResolutionRollState {
  toHit: RollResult | null;
  verdict: TallyVerdict | undefined;
  effect: RollResult | null;
}

/**
 * The steps a `TurnResolution` drives, in order, given the current roll
 * state. A weapon swing or an attack-roll spell (`toHit` present) emits
 * [toHit, callIt, damage?] via `stepRail` unchanged; a saving-throw spell
 * (`save` present) emits [announceSave, damage?] — no to-hit die, no
 * ambiguous "call it"; an auto-hit spell (`effect` alone) emits [damage]; a
 * no-roll utility spell emits no steps at all (`ResolutionRail` renders its
 * one-tap "Resolve" affordance off the empty list, see `resolutionReady`).
 * `damage` is omitted entirely when the resolution has no effect (a save
 * that only imposes a condition, no roll of any kind, #1827).
 */
export function computeResolutionSteps(
  resolution: Pick<TurnResolution, "toHit" | "save" | "effect">,
  state: ResolutionRollState,
): ResolutionStep[] {
  if (resolution.toHit) {
    const rail = stepRail({
      hasRoll: state.toHit !== null,
      verdict: state.verdict,
      hasDamage: state.effect !== null,
    });
    const steps: ResolutionStep[] = [
      { kind: "toHit", state: rail.rollToHit },
      { kind: "callIt", state: rail.callIt },
    ];
    if (resolution.effect) steps.push({ kind: "damage", state: rail.damage });
    return steps;
  }

  if (resolution.save) {
    const steps: ResolutionStep[] = [{ kind: "announceSave", state: "done" }];
    if (resolution.effect) {
      steps.push({ kind: "damage", state: state.effect !== null ? "done" : "active" });
    }
    return steps;
  }

  if (resolution.effect) {
    return [{ kind: "damage", state: state.effect !== null ? "done" : "active" }];
  }

  return [];
}

/**
 * Whether every step is settled — a missed to-hit is settled too (the
 * trailing `damage` step reads "pending" forever on a miss, per stepRail's
 * own rule: "a missed attack deals no damage"; that pending damage step is
 * the ONLY state a fully-resolved step list can carry besides "done", so it
 * doesn't block completion). An empty step list (no-roll shape) is NOT
 * "complete" here — `resolutionReady` below is what a no-roll resolution
 * uses, since completion still needs one explicit tap, never an implicit
 * empty-list default.
 */
export function resolutionComplete(steps: ResolutionStep[]): boolean {
  if (steps.length === 0) return false;
  return steps.every((step, i) => {
    if (step.state === "done") return true;
    const isLast = i === steps.length - 1;
    return isLast && step.kind === "damage" && step.state === "pending";
  });
}

/**
 * Ready for the rail's explicit "Resolve"/"Done" tap — every real step is
 * complete (`resolutionComplete`), OR there are no steps at all (a no-roll
 * resolution is ready the instant it's shown; "immediate commit" per the
 * design spec means one tap, not zero).
 */
export function resolutionReady(steps: ResolutionStep[]): boolean {
  return steps.length === 0 || resolutionComplete(steps);
}
