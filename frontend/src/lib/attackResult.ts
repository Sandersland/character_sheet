// Pure result-line derivation for AttackResultLine: crit/miss cues, kept dice,
// effective total, and tone — so the row component renders only (#778).

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
  /** Nat-20 kept d20 on a to-hit roll — drives the "Critical hit!" cue. */
  critHit: boolean;
  /** Nat-1 kept d20 on a to-hit roll — drives the "Miss" cue. */
  miss: boolean;
  /** The roll itself was a doubled-dice crit (spec.crit). */
  critSpec: boolean;
  /** A maneuver-summed override replaced the raw total. */
  hasOverride: boolean;
  tone: ResultLineTone;
}

// Arcane (magic-neutral) for the to-hit d20, garnet for weapon damage — box and
// total share one tone so a roll doesn't mix arcane boxes with a garnet total.
const ATTACK_TONE: ResultLineTone = {
  box: "border-arcane-400 bg-arcane-50 text-arcane-800",
  total: "text-arcane-800",
};
const DAMAGE_TONE: ResultLineTone = {
  box: "border-garnet-300 bg-garnet-50 text-garnet-800",
  total: "text-garnet-800",
};

// Everything AttackResultLine renders, derived once. Crit/miss cues are to-hit
// only; a maneuver-summed override wins over the raw total when present.
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
