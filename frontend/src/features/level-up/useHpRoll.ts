// Roll + selection state for the HP step (#887, #1172). Holds the rolled hit
// die locally so toggling average↔roll reuses the same roll — HitPointsStep
// keeps the reveal mounted (hidden, not torn down) so a settled die lingers.
// Drops a held roll when the advancing class (hence the die) changes, so a d10
// roll never carries onto a d6 class; the reveal's `key={math.faces}` then
// forces the one legitimate remount, re-rolling the new die. Owns every draft
// write for the step.

import { useEffect, useState } from "react";

import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import type { RollResult } from "@/lib/dice";
import type { HitPointStepMath } from "@/lib/hitDice";

export interface HpRoll {
  roll: number | null;
  method: "average" | "roll" | undefined;
  /** New-max HP gain for the current choice, or null when nothing is chosen yet. */
  gain: number | null;
  handleRoll: (result: RollResult) => void;
  chooseAverage: () => void;
  chooseRoll: () => void;
}

export function useHpRoll(math: HitPointStepMath): HpRoll {
  const { draft, setDraft } = useLevelUpStepContext();
  const [roll, setRoll] = useState<number | null>(null);
  useEffect(() => setRoll(null), [math.faces]);

  const method = draft.hp?.method;
  const gain =
    method === "average" ? math.averageGain : method === "roll" && roll != null ? roll + math.conMod : null;

  function handleRoll(result: RollResult) {
    const value = result.dice[0]?.value ?? 1;
    setRoll(value);
    setDraft((d) => ({ ...d, hp: { method: "roll", roll: value } }));
  }

  return {
    roll,
    method,
    gain,
    handleRoll,
    chooseAverage: () => setDraft((d) => ({ ...d, hp: { method: "average" } })),
    chooseRoll: () => setDraft((d) => ({ ...d, hp: roll != null ? { method: "roll", roll } : { method: "roll" } })),
  };
}
