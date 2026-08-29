// Damage arms as soon as a roll exists (rolling damage IS the hit call) — it never gates on step 2; only a miss verdict parks it (#811).
import type { TallyVerdict } from "@/lib/attackTallySummary";

export type StepState = "done" | "active" | "pending";

export interface StepRailModel {
  rollToHit: StepState;
  callIt: StepState;
  damage: StepState;
  damageSettled: boolean;
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
    return { rollToHit: "active", callIt: "pending", damage: "pending", damageSettled: false };
  }
  return {
    rollToHit: "done",
    callIt: verdict !== undefined ? "done" : "active",
    damage: verdict === "miss" ? "pending" : hasDamage ? "done" : "active",
    damageSettled: verdict === "miss" || hasDamage,
  };
}
