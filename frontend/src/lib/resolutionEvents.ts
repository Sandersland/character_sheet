// Shared by useResolution (top-level toHit/effect) and useInstanceResolution (per-instance toHit/effect,
// #1983) — the SAME event-shape construction either way, so it lives in one place instead of two
// duplicated copies (fallow flagged the duplicate on first pass).

import { formatRollSpec, keptD20 } from "@/lib/dice";
import type { TallyAttackRoll, TallyVerdict } from "@/lib/attackTallySummary";
import type { RollResult } from "@/lib/dice";
import type { ResolveActionEventEffect, ResolveActionEventToHit, TurnResolution } from "@character-sheet/shared-types";

export interface ToHitRollState {
  result: RollResult;
  attack: TallyAttackRoll;
  verdict: TallyVerdict | undefined;
  /** Folded into `result.total` at roll time; added into `bonus` here so kept + bonus === total (descriptor's own `bonus` alone doesn't cover it). */
  modifier: number;
}

export function buildToHitEvent(
  state: ToHitRollState,
  descriptor: NonNullable<TurnResolution["toHit"]>,
  boost = 0,
): ResolveActionEventToHit {
  const verdict = state.verdict;
  if (verdict === undefined) {
    throw new Error("resolutionEvents: buildToHitEvent called before the verdict settled");
  }
  return {
    faces: state.result.dice.map((d) => d.value),
    kept: keptD20(state.result)?.value ?? state.result.total,
    nat20: state.attack.nat20,
    // descriptor.bonus alone omits the roll-mode flat modifier and the #1844 boost — both fold in here so kept + bonus === total holds (ResolveActionEventToHit's contract).
    bonus: descriptor.bonus + state.modifier + boost,
    total: state.result.total + boost,
    verdict,
    ...(descriptor.components ? { components: descriptor.components } : {}),
  };
}

export function buildEffectEvent(
  result: RollResult,
  descriptor: NonNullable<TurnResolution["effect"]>,
  crit: boolean,
): ResolveActionEventEffect {
  return {
    spec: formatRollSpec(result.spec),
    faces: result.dice.map((d) => d.value),
    total: result.total,
    // "healing" is a display fallback here, never a real 5e damage type — damageType is absent only for a heal.
    type: descriptor.damageType ?? "healing",
    kind: descriptor.kind,
    crit,
    ...(descriptor.components ? { components: descriptor.components } : {}),
  };
}
