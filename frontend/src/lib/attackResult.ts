import { isNaturalOne, isNaturalTwenty } from "@/lib/dice";
import type { DieRoll, RollResult } from "@/lib/dice";

export type ResultKind = "attack" | "damage";

export interface ResultLineTone {
  box: string;
  total: string;
}

export interface ResultLineView {
  keptDice: DieRoll[];
  faces: number;
  modifier: number;
  total: number;
  critHit: boolean;
  miss: boolean;
  critSpec: boolean;
  hasOverride: boolean;
  tone: ResultLineTone;
}

// box and total share one tone (arcane for to-hit, garnet for damage) so a roll never mixes tones.
const ATTACK_TONE: ResultLineTone = {
  box: "border-arcane-400 bg-arcane-50 text-arcane-800",
  total: "text-arcane-800",
};
const DAMAGE_TONE: ResultLineTone = {
  box: "border-garnet-300 bg-garnet-50 text-garnet-800",
  total: "text-garnet-800",
};

export function resultLineView(
  result: RollResult,
  kind: ResultKind,
  overrideTotal?: number | null,
): ResultLineView {
  const isAttack = kind === "attack";
  return {
    keptDice: result.dice.filter((d) => !d.dropped),
    faces: result.spec.faces,
    modifier: result.modifier,
    total: overrideTotal ?? result.total,
    critHit: isAttack && isNaturalTwenty(result),
    miss: isAttack && isNaturalOne(result),
    critSpec: Boolean(result.spec.crit),
    hasOverride: overrideTotal != null,
    tone: isAttack ? ATTACK_TONE : DAMAGE_TONE,
  };
}
