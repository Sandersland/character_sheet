// Deliberately does not call `useRollLogger`/`logRoll` — that per-roll log path is retired in favor of the single consolidated `resolveAction` event.

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

/** Spends exactly one of these three slots at completion — the single spend site (`spendSlot`). */
export type ResolutionTurnState = Pick<
  TurnStateView,
  "actionsRemaining" | "bonusActionUsed" | "reactionUsed" | "consumeAction" | "consumeBonusAction" | "consumeReaction"
>;

/** One shared constant so a future ResolutionTurnState consume method can't be added to one caller's shim and missed on the other (#1848). */
export const INERT_RESOLUTION_CONSUMERS: Pick<
  ResolutionTurnState,
  "consumeAction" | "consumeBonusAction" | "consumeReaction"
> = {
  consumeAction: () => {},
  consumeBonusAction: () => {},
  consumeReaction: () => {},
};

/** `save` is never rolled (no target model) — echoed from the descriptor so the adapter needs only this object. */
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
  /** Folded into `result.total` at roll time; `buildToHitEvent` adds it into `bonus` so kept + bonus === total (descriptor's own `bonus` alone doesn't cover it). */
  modifier: number;
}

export interface ResolutionView {
  source: string;
  steps: ResolutionStep[];
  disabled: boolean;
  completed: boolean;
  readyToComplete: boolean;

  toHit: TurnResolution["toHit"];
  toHitRoll: RollResult | null;
  attack: TallyAttackRoll | null;
  verdict: TallyVerdict | undefined;
  isCrit: boolean;
  /** "" when no chip applies (#486). */
  attackChip: string;
  attackMode: RollMode;

  save: TurnResolution["save"];

  effect: TurnResolution["effect"];
  effectRoll: RollResult | null;

  onRollToHit: () => void;
  /** Refused when the die already locked the verdict (nat 1 or crit-range hit) — mirrors AttackStepCard's CallItStep. */
  onCallMiss: () => void;
  /** Refused when already die-locked to crit or miss. */
  onCallCrit: () => void;
  onRollEffect: () => void;
  /** Adds `delta` to the committed to-hit total after the d20 lands (#1844); folds into the persisted event, not just the tally; inert once completed. */
  boostToHit: (delta: number) => void;
  onComplete: () => void;
}

export interface UseResolutionArgs {
  resolution: TurnResolution;
  turnState: ResolutionTurnState;
  /** The resolver doesn't know about the `resolveAction` endpoint — the weapon/spell adapter turns this into the transaction op (#1832/#1833). */
  commit: (rolls: ResolutionRolls) => void;
  /** Only affects the to-hit roll — a save/auto-hit/no-roll resolution has no d20 to apply it to. */
  manualMode?: RollMode;
}

export interface UseResolutionResult {
  view: ResolutionView;
  /** Only `onComplete` ever spends the economy, so calling this beforehand is pure local state — safe to call mid-resolution. */
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

// Keeps a nat20 always paired with verdict "crit" — resolveActionToHitSchema's superRefine requires it.
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
    // descriptor.bonus alone omits the roll-mode flat modifier and the #1844 boost — both fold in here so kept + bonus === total holds (ResolveActionEventToHit's contract).
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
    // "healing" is a display fallback here, never a real 5e damage type — damageType is absent only for a heal.
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

  function boostToHit(delta: number) {
    if (disabled || completed) return;
    setToHitBoost((b) => b + delta);
  }

  function onComplete() {
    if (disabled || completed || !readyToComplete) return;
    // `commit` runs before the spend/complete side effects, so a throwing commit doesn't consume the action-economy slot or block a retry.
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
