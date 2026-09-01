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

// A roll:"once" instance's crit can't re-roll — the whole point of "once" (2014 Magic Missile) is
// one shared roll for every dart — so this doubles the ALREADY-ROLLED dice subtotal only, per the
// real 5e rule (attackMath.ts's critDamageSpec / dice.ts's critCount are the authority: double the
// DICE count, the modifier stays flat once). Echoing each already-rolled die's value a second time
// (never re-rolling fresh values) keeps `total` reconciling to `sum(faces) + modifier`, which
// sessionLogFeed's drill-in and AttackResultLine's rendering both assume. Feed the result through
// buildEffectEvent (not built ad hoc) so spec/faces/total/crit stay in the same one place.
export function doubleRollForOnceModeCrit(result: RollResult): RollResult {
  const diceSubtotal = result.total - result.modifier;
  return {
    ...result,
    dice: [...result.dice, ...result.dice],
    spec: { ...result.spec, crit: true },
    total: diceSubtotal * 2 + result.modifier,
  };
}

// The turn's "Spells cast" tally (CastTallyBanner) reads RecordedSpellCast.total off the top-level
// `rolls.effect`, which stays null for an instanced cast (InstanceResolutionStrip rolls per instance,
// never the top-level roll, per ResolutionRolls' own comment) — without this, Scorching Ray/Eldritch
// Blast/Magic Missile silently dropped their damage from the banner. undefined (not 0) when nothing
// landed, matching the un-instanced miss convention: "no roll happened" reads as no total, not "0 damage".
// Twin of the backend sumInstanceEffectTotals — same sum/undefined-when-none semantics on either
// side of the wire; change the all-miss convention in both or neither. Neither filters by verdict:
// both rely on a missed instance carrying effect null (onRollToHitInstance voids a pre-rolled
// effect), unlike sessionLogFeed's instancesEffectTotal, which re-checks the verdict as defence.
export function sumInstanceEffects(instances: { effect?: ResolveActionEventEffect | null }[]): number | undefined {
  const landed = instances.filter((i): i is { effect: ResolveActionEventEffect } => i.effect != null);
  if (landed.length === 0) return undefined;
  return landed.reduce((sum, i) => sum + i.effect.total, 0);
}

// Multi-instance rolls never populate the top-level `rolls.effect` — the cast's total lives per
// instance (Scorching Ray's rays, Eldritch Blast's beams). Every consumer of "what did this cast
// total" (the settled banner, a heal's apply amount) reads through here.
export function resolvedEffectTotal(rolls: {
  effect?: { total: number } | null;
  instances?: { effect?: ResolveActionEventEffect | null }[] | null;
}): number | undefined {
  return rolls.effect?.total ?? sumInstanceEffects(rolls.instances ?? []);
}
