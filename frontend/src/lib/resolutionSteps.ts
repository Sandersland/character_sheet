import { stepRail, type StepState } from "@/lib/attackStepRail";
import type { TallyVerdict } from "@/lib/attackTallySummary";
import type { RollResult } from "@/lib/dice";
import type { TurnResolution } from "@character-sheet/shared-types";

export type ResolutionStepKind = "toHit" | "callIt" | "announceSave" | "damage";

export interface ResolutionStep {
  kind: ResolutionStepKind;
  state: StepState;
}

export interface ResolutionRollState {
  toHit: RollResult | null;
  verdict: TallyVerdict | undefined;
  effect: RollResult | null;
}

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

export function resolutionComplete(steps: ResolutionStep[]): boolean {
  if (steps.length === 0) return false;
  return steps.every((step, i) => {
    if (step.state === "done") return true;
    const isLast = i === steps.length - 1;
    return isLast && step.kind === "damage" && step.state === "pending";
  });
}

export function resolutionReady(steps: ResolutionStep[]): boolean {
  return steps.length === 0 || resolutionComplete(steps);
}
