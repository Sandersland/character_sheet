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
