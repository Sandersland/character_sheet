// Pure step model for the attack sheet's 1-2-3 rail (#811): Roll to hit →
// Call it → Damage. No JSX — rendered by AttackStepCard.
//
// "Damage" arms as soon as a roll exists (implicit hit — rolling damage IS the
// hit call), so it never gates on step 2; a miss verdict parks it (a missed
// attack deals no damage).

import type { TallyVerdict } from "@/lib/attackTallySummary";

export type StepState = "done" | "active" | "pending";

export interface StepRailModel {
  rollToHit: StepState;
  callIt: StepState;
  damage: StepState;
}

export function stepRail({
  hasRoll,
  verdict,
  hasDamage,
}: {
  hasRoll: boolean;
  verdict: TallyVerdict | undefined;
  hasDamage: boolean;
}): StepRailModel {
  if (!hasRoll) {
    return { rollToHit: "active", callIt: "pending", damage: "pending" };
  }
  return {
    rollToHit: "done",
    callIt: verdict !== undefined ? "done" : "active",
    damage: verdict === "miss" ? "pending" : hasDamage ? "done" : "active",
  };
}
