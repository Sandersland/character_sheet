// useResolution (epic #1827 Slice 4, #1831) — the shared resolver hook that
// replaces the diverging weapon/spell halves (useAttackRolls+AttackStepCard
// vs. useSpellPicker+InlineSpellAttackSection): ONE hook drives the rail for
// all four TurnResolution shapes (attack roll / saving throw / auto-hit /
// no-roll) and does the three completion things in ONE place — spend the
// economy (`useTurnState`, the single spend site), fire the caller's
// `commit(rolls)`, and tag the rolls with one `actionId`.
//
// Deliberately does NOT call `useRollLogger`/`logRoll`: that write path
// persists individual attack/damage roll events (the OLD per-roll log the
// epic retires — see resolve-action.ts's "Retire the logRoll write path for
// attack/damage" and the design spec's "one action = one row, enforced by the
// schema, not a correlation convention"). Logging both per-roll AND the
// consolidated `resolveAction` event once an adapter wires `commit` to it
// would reintroduce #1822 (spell log noise) at the very hook meant to fix it.
// `useRoll().roll` still drives the dice — that's the toast/3D-die mechanism,
// not persistence. The adapter (#1832/#1833) turns `commit`'s payload into
// the one `resolveAction` transaction op.
//
// Completion is always an explicit tap (`onComplete`), never auto-fired the
// instant the last die lands — mirrors AttackStepCard's existing "Next"
// gesture (a pause to review before committing) and gives a no-roll
// resolution (Druidcraft) and a save-with-no-effect resolution the same
// single affordance a rolled resolution ends on.

import { useRef, useState } from "react";

import { critDamageSpec } from "@/lib/attackMath";
import { autoVerdict, toHitSnapshot } from "@/lib/attackTallySummary";
import { formatRollSpec, keptD20 } from "@/lib/dice";
import { randomId } from "@/lib/ids";
import { computeResolutionSteps, resolutionReady, type ResolutionStep } from "@/lib/resolutionSteps";
import { resolveRollMode, rollModeChip } from "@/lib/rollMode";
import { useRoll } from "@/features/dice/RollContext";
import type { TallyAttackRoll, TallyVerdict } from "@/lib/attackTallySummary";
import type { RollMode, RollResult, RollSpec } from "@/lib/dice";
import type { TurnStateView } from "@/features/session/useTurnState";
import type {
  ResolveActionEventEffect,
  ResolveActionEventSave,
  ResolveActionEventToHit,
  TurnResolution,
} from "@character-sheet/shared-types";

/** The narrow slice of `useTurnState` a resolution needs: read the live slot
 *  availability for `disabled`, and spend exactly ONE of the three slots at
 *  completion (the single spend site). */
export type ResolutionTurnState = Pick<
  TurnStateView,
  "actionsRemaining" | "bonusActionUsed" | "reactionUsed" | "consumeAction" | "consumeBonusAction" | "consumeReaction"
>;

/**
 * The three `consume*` handlers, deliberately inert — the shared shim every
 * adapter's own economy-availability-only `ResolutionTurnState` spreads in
 * when the REAL spend happens somewhere other than `useResolution`'s own
 * `spendSlot()` call: InlineAttackPicker's `attackResolutionTurnState`
 * (Extra Attack already spent the action via `enterAttackMode`, before the
 * sheet even opens) and InlineSpellPicker's `spellResolutionTurnState` (the
 * spend is the caller's slot-kind-aware `onCommitSlot`, fired from
 * `handleCommit` once the mutation actually succeeds). One shared constant
 * so a future fourth `ResolutionTurnState` consume method can't be added to
 * one shim and silently missed on the other (#1848 review).
 */
export const INERT_RESOLUTION_CONSUMERS: Pick<
  ResolutionTurnState,
  "consumeAction" | "consumeBonusAction" | "consumeReaction"
> = {
  consumeAction: () => {},
  consumeBonusAction: () => {},
  consumeReaction: () => {},
};

/**
 * The payload `commit` receives — the op-shaped rolls (reusing the
 * `resolveAction` wire types verbatim, #1829) plus the one `actionId` tagging
 * them. `save` is never rolled (no target model — DC/ability are just echoed
 * from the descriptor) but travels here anyway so a single object holds
 * everything the adapter needs to build its `ResolveActionOperation` — it
 * doesn't have to cross-reference `resolution.save` separately.
 */
export interface ResolutionRolls {
  actionId: string;
  toHit: ResolveActionEventToHit | null;
  save: ResolveActionEventSave | null;
  effect: ResolveActionEventEffect | null;
}

interface ToHitState {
  result: RollResult;
  attack: TallyAttackRoll;
  verdict: TallyVerdict | undefined;
  /** The resolved roll-mode flat modifier (e.g. exhaustion) folded into
   *  `result.total` at roll time — `buildToHitEvent` adds it into the
   *  persisted `bonus` so `kept + bonus === total` (`ResolveActionEventToHit.bonus`'s
   *  documented contract: "the resolved flat total added to the die"),
   *  which the descriptor's own `bonus` alone doesn't cover. */
  modifier: number;
}

/** Everything `ResolutionRail` needs to render one of the four shapes, plus
 *  the step handlers driving them. */
export interface ResolutionView {
  source: string;
  steps: ResolutionStep[];
  /** True while the economy slot this resolution would spend isn't available
   *  — gates every handler below (including `onComplete`) until it clears. */
  disabled: boolean;
  /** True once `onComplete` has fired — every handler below is inert after. */
  completed: boolean;
  /** Every real step is settled (or there are none) — gates `onComplete`. */
  readyToComplete: boolean;

  toHit: TurnResolution["toHit"];
  toHitRoll: RollResult | null;
  attack: TallyAttackRoll | null;
  verdict: TallyVerdict | undefined;
  /** Crit doubles the damage dice, read from the verdict — never a second
   *  live die check (mirrors useAttackRolls' isRowCrit, simplified: this
   *  hook's own `verdict` already folds in both the crit-range auto-call and
   *  a manual "Crit!", so checking it once is sufficient here). */
  isCrit: boolean;
  /** State-driven ADV/DIS chip (#486) for the to-hit roll; "" when none. */
  attackChip: string;
  attackMode: RollMode;

  save: TurnResolution["save"];

  effect: TurnResolution["effect"];
  effectRoll: RollResult | null;

  onRollToHit: () => void;
  /** "it Missed" — refused when the die already locked the verdict (nat 1 or
   *  a crit-range hit), mirroring AttackStepCard's CallItStep. */
  onCallMiss: () => void;
  /** "Crit!" — refused when already die-locked to crit or miss. */
  onCallCrit: () => void;
  onRollEffect: () => void;
  /** External to-hit booster seam (#1844): a Precision Attack maneuver adds
   *  `delta` (its spent superiority die) to the committed to-hit total AFTER
   *  the d20 lands. Folds into the persisted event, not just the tally; inert
   *  once completed. */
  boostToHit: (delta: number) => void;
  /** The one completion tap: spends the economy, fires `commit`, and marks
   *  `completed`. No-ops when `disabled`, already `completed`, or not yet
   *  `readyToComplete`. */
  onComplete: () => void;
}

export interface UseResolutionArgs {
  resolution: TurnResolution;
  turnState: ResolutionTurnState;
  /** Fired once, at completion, with every roll this resolution made. The
   *  resolver does not itself know about the `resolveAction` endpoint — the
   *  weapon/spell adapter (#1832/#1833) is what turns this into the
   *  transaction op. */
  commit: (rolls: ResolutionRolls) => void;
  /** The picker's own ADV/DIS control (#958), merged with state-driven
   *  grants the same way useAttackRolls merges them. Only affects the to-hit
   *  roll — a save/auto-hit/no-roll resolution has no d20 to apply it to. */
  manualMode?: RollMode;
}

export interface UseResolutionResult {
  view: ResolutionView;
  /** Clears roll state and mints a fresh `actionId` so the SAME hook
   *  instance can drive a new resolution (e.g. the next spell in a Cast
   *  sheet) without remounting. A no-op mid-resolution economy concern: only
   *  `onComplete` ever spends, so a reset before that is pure local state. */
  reset: () => void;
}

function slotAvailable(cost: TurnResolution["cost"], turnState: ResolutionTurnState): boolean {
  if (cost.kind === "action") return turnState.actionsRemaining > 0;
  if (cost.kind === "bonusAction") return !turnState.bonusActionUsed;
  return !turnState.reactionUsed;
}

function spendSlot(cost: TurnResolution["cost"], turnState: ResolutionTurnState): void {
  if (cost.kind === "action") turnState.consumeAction();
  else if (cost.kind === "bonusAction") turnState.consumeBonusAction();
  else turnState.consumeReaction();
}

// Die-locked verdicts (a crit-range hit or a nat 1) refuse a manual call —
// mirrors AttackStepCard's CallItStep, and keeps a nat20 always paired with
// verdict "crit" the way resolveActionToHitSchema's superRefine requires.
function isDieLocked(attack: TallyAttackRoll): boolean {
  return attack.criticalHit || attack.nat1;
}

function buildToHitEvent(
  state: ToHitState,
  descriptor: NonNullable<TurnResolution["toHit"]>,
  boost: number,
): ResolveActionEventToHit {
  const verdict = state.verdict;
  if (verdict === undefined) {
    throw new Error("useResolution: buildToHitEvent called before the verdict settled");
  }
  return {
    faces: state.result.dice.map((d) => d.value),
    kept: keptD20(state.result)?.value ?? state.result.total,
    nat20: state.attack.nat20,
    // `descriptor.bonus` alone omits the roll-mode flat modifier (exhaustion,
    // #1136) that was folded into the actual die roll — adding `state.modifier`
    // keeps `bonus` the true resolved flat total added to the die, per
    // ResolveActionEventToHit's contract (kept + bonus === total). `boost`
    // (#1844) is an external booster's post-roll addend (Precision Attack's
    // superiority die), added to BOTH sides so that contract still holds.
    bonus: descriptor.bonus + state.modifier + boost,
    total: state.result.total + boost,
    verdict,
    ...(descriptor.components ? { components: descriptor.components } : {}),
  };
}

function buildEffectEvent(
  result: RollResult,
  descriptor: NonNullable<TurnResolution["effect"]>,
  crit: boolean,
): ResolveActionEventEffect {
  return {
    spec: formatRollSpec(result.spec),
    faces: result.dice.map((d) => d.value),
    total: result.total,
    // Absent only for a heal (TurnResolutionEffect.damageType docstring) —
    // "healing" is a display fallback, never a 5e damage type of its own.
    type: descriptor.damageType ?? "healing",
    kind: descriptor.kind,
    crit,
    ...(descriptor.components ? { components: descriptor.components } : {}),
  };
}

export function useResolution({
  resolution,
  turnState,
  commit,
  manualMode = "normal",
}: UseResolutionArgs): UseResolutionResult {
  const { roll, rollModifiers } = useRoll();

  const [toHitState, setToHitState] = useState<ToHitState | null>(null);
  const [effectRoll, setEffectRoll] = useState<RollResult | null>(null);
  // External to-hit addend (#1844): a Precision Attack maneuver spends its
  // superiority die AFTER the d20 lands, then boosts the committed roll through
  // `boostToHit`. Held here so `buildToHitEvent` folds it into the audit event,
  // not just the transient tally.
  const [toHitBoost, setToHitBoost] = useState(0);
  const [completed, setCompleted] = useState(false);
  const actionIdRef = useRef(randomId());

  const disabled = !slotAvailable(resolution.cost, turnState);
  const verdict = toHitState?.verdict;
  const isCrit = verdict === "crit";

  const steps = computeResolutionSteps(resolution, {
    toHit: toHitState?.result ?? null,
    verdict,
    effect: effectRoll,
  });
  const readyToComplete = resolutionReady(steps);

  const resolvedAttack = resolveRollMode(rollModifiers, { kind: "attack" }, manualMode);
  const attackChip = resolution.toHit ? rollModeChip(resolvedAttack) : "";
  const attackMode = resolvedAttack.mode;

  function onRollToHit() {
    if (disabled || completed || !resolution.toHit || toHitState) return;
    const spec: RollSpec = {
      count: 1,
      faces: 20,
      modifier: resolution.toHit.bonus + resolvedAttack.modifier,
      mode: resolvedAttack.mode,
    };
    const result = roll(spec, `${resolution.source} attack`);
    const attack = toHitSnapshot(result, resolution.toHit.critRange);
    setToHitState({ result, attack, verdict: autoVerdict(attack), modifier: resolvedAttack.modifier });
  }

  function onCallMiss() {
    if (disabled || completed || !toHitState || toHitState.verdict !== undefined) return;
    setToHitState({ ...toHitState, verdict: "miss" });
  }

  // Root guards (#1845's off-hand path will drive this hook directly, not
  // through the #1832 adapter wrapper that only guarded the crit call there):
  // can't upgrade to crit over already-rolled, non-doubled damage, and can't
  // upgrade a called miss either.
  function onCallCrit() {
    if (effectRoll) return;
    if (toHitState?.verdict === "miss") return;
    if (disabled || completed || !toHitState) return;
    if (isDieLocked(toHitState.attack) && toHitState.verdict !== "crit") return;
    setToHitState({ ...toHitState, verdict: "crit" });
  }

  // Rolling damage IS the hit call (#811) — an unset verdict resolves to
  // "hit" the moment damage lands, mirroring useTurnState's withAutoHit.
  function resolveImplicitHit() {
    if (!resolution.toHit || !toHitState || toHitState.verdict !== undefined) return;
    setToHitState({ ...toHitState, verdict: "hit" });
  }

  function onRollEffect() {
    if (disabled || completed || !resolution.effect || effectRoll) return;
    if (resolution.toHit && verdict === "miss") return;
    const spec = isCrit ? critDamageSpec(resolution.effect.spec as RollSpec) : (resolution.effect.spec as RollSpec);
    const result = roll(spec, `${resolution.source} damage`);
    setEffectRoll(result);
    resolveImplicitHit();
  }

  // The external booster seam (#1844): a maneuver adapter adds its spent die
  // to the committed to-hit total after the d20 lands. Inert once the roll is
  // committed (`completed`) or the slot is unavailable — matches every other
  // handler here, so a late tap can't rewrite a persisted event.
  function boostToHit(delta: number) {
    if (disabled || completed) return;
    setToHitBoost((b) => b + delta);
  }

  function onComplete() {
    if (disabled || completed || !readyToComplete) return;
    // `commit` runs BEFORE the spend/complete side effects — a throwing
    // commit must not permanently consume the action-economy slot or lock
    // out a retry (the caller can catch and let the player try again).
    commit({
      actionId: actionIdRef.current,
      toHit: resolution.toHit && toHitState ? buildToHitEvent(toHitState, resolution.toHit, toHitBoost) : null,
      save: resolution.save ?? null,
      effect: resolution.effect && effectRoll ? buildEffectEvent(effectRoll, resolution.effect, isCrit) : null,
    });
    spendSlot(resolution.cost, turnState);
    setCompleted(true);
  }

  function reset() {
    setToHitState(null);
    setEffectRoll(null);
    setToHitBoost(0);
    setCompleted(false);
    actionIdRef.current = randomId();
  }

  const view: ResolutionView = {
    source: resolution.source,
    steps,
    disabled,
    completed,
    readyToComplete,
    toHit: resolution.toHit,
    toHitRoll: toHitState?.result ?? null,
    attack: toHitState?.attack ?? null,
    verdict,
    isCrit,
    attackChip,
    attackMode,
    save: resolution.save,
    effect: resolution.effect,
    effectRoll,
    onRollToHit,
    onCallMiss,
    onCallCrit,
    onRollEffect,
    boostToHit,
    onComplete,
  };

  return { view, reset };
}
