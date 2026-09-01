// Deliberately does not call `useRollLogger`/`logRoll` — that per-roll log path is retired in favor of the single consolidated `resolveAction` event.

import { useRef, useState } from "react";

import { critDamageSpec } from "@/lib/attackMath";
import { autoVerdict, toHitSnapshot } from "@/lib/attackTallySummary";
import { randomId } from "@/lib/ids";
import { buildEffectEvent, buildToHitEvent, type ToHitRollState } from "@/lib/resolutionEvents";
import { computeResolutionSteps, resolutionReady, type ResolutionStep } from "@/lib/resolutionSteps";
import { resolveRollMode, rollModeChip } from "@/lib/rollMode";
import { useRoll } from "@/features/dice/RollContext";
import { useInstanceResolution } from "@/features/session/useInstanceResolution";
import type { TallyAttackRoll, TallyVerdict } from "@/lib/attackTallySummary";
import type { RollMode, RollResult, RollSpec } from "@/lib/dice";
import type { TurnStateView } from "@/features/session/useTurnState";
import type {
  ResolveActionEventEffect,
  ResolveActionEventInstance,
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

/** `save` is never rolled (no target model) — echoed from the descriptor so the adapter needs only this object. `instances` is present only for an instanced resolution and is then mutually exclusive with `toHit`/`effect` (both null), mirroring the op schema (resolveActionOperationSchema's superRefine). */
export interface ResolutionRolls {
  actionId: string;
  toHit: ResolveActionEventToHit | null;
  save: ResolveActionEventSave | null;
  effect: ResolveActionEventEffect | null;
  instances?: ResolveActionEventInstance[];
}

type ToHitState = ToHitRollState;

/** Per-instance view exposed for a compact resolution strip (InstanceResolutionStrip, #1983) — same roll/action shape as the top-level `ResolutionView` fields, scoped to one dart/ray/beam. For a roll:"once" resolution (2014 Magic Missile), `toHitRoll`/`attack` stay null and `onRollToHit`/`onCallMiss` are no-ops — `effectRoll` mirrors the shared top-level roll (doubled when `isCrit`), and `onCallCrit` toggles this instance's own crit flag instead of calling a per-instance die. Built by `useInstanceResolution` (#1983 review — split out to keep this file under fallow's cognitive-complexity threshold). */
export interface ResolutionInstanceView {
  index: number;
  toHitRoll: RollResult | null;
  attack: TallyAttackRoll | null;
  verdict: TallyVerdict | undefined;
  isCrit: boolean;
  effectRoll: RollResult | null;
  onRollToHit: () => void;
  onCallMiss: () => void;
  onCallCrit: () => void;
  onRollEffect: () => void;
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

  /** Present only for an instanced resolution (Magic Missile's darts, Scorching Ray's rays, Eldritch Blast's beams) — length === resolution.instances.count. A consumer branches on this instead of the top-level toHit/effect fields, which stay inert (never rolled) once instances is present. */
  instances?: ResolutionInstanceView[];
  instanceRoll?: "each" | "once";

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

// Stands in for the top-level roll actions once instanceRes.usesPerInstanceEach — a single module-scope
// constant so the view-assembly ternary is one branch, not four (#1983 review, see the four functions' own comment).
function NOOP_ACTION() {}

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

  const resolvedAttack = resolveRollMode(rollModifiers, { kind: "attack" }, manualMode);
  const attackChip = resolution.toHit ? rollModeChip(resolvedAttack) : "";
  const attackMode = resolvedAttack.mode;

  const instanceRes = useInstanceResolution({
    resolution,
    resolvedAttack,
    roll,
    disabled,
    completed,
    sharedEffectRoll: effectRoll,
  });
  const isInstanced = resolution.instances !== undefined;

  const steps = computeResolutionSteps(resolution, {
    toHit: toHitState?.result ?? null,
    verdict,
    effect: effectRoll,
    ...(instanceRes.usesPerInstanceEach ? { instances: instanceRes.instanceStateList } : {}),
  });
  const readyToComplete = resolutionReady(steps);

  // These four never fire once instanceRes.usesPerInstanceEach is true — the view assembly below
  // swaps them for NOOP_ACTION instead of folding the gate into each guard clause, so an instanced
  // cast doesn't inflate these pre-existing (already-tested) functions' own complexity (#1983 review).
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

  // instances is mutually exclusive with toHit/effect at the wire (resolveActionOperationSchema's
  // superRefine) — an instanced resolution sends both top-level fields null, never populated, even
  // in roll:"once" mode where the shared roll lives in `effectRoll` internally. `readyToComplete`
  // already guards a mid-flight (unsettled-verdict) toHitState from ever reaching here — onComplete
  // is the only caller, never evaluated eagerly on every render.
  function committedToHit(): ResolveActionEventToHit | null {
    if (isInstanced || !resolution.toHit || !toHitState) return null;
    return buildToHitEvent(toHitState, resolution.toHit, toHitBoost);
  }

  function committedEffect(): ResolveActionEventEffect | null {
    if (isInstanced || !resolution.effect || !effectRoll) return null;
    return buildEffectEvent(effectRoll, resolution.effect, isCrit);
  }

  function onComplete() {
    if (disabled || completed || !readyToComplete) return;
    // `commit` runs before the spend/complete side effects, so a throwing commit doesn't consume the action-economy slot or block a retry.
    commit({
      actionId: actionIdRef.current,
      toHit: committedToHit(),
      save: resolution.save ?? null,
      effect: committedEffect(),
      ...(isInstanced ? { instances: instanceRes.buildInstanceEvents() } : {}),
    });
    spendSlot(resolution.cost, turnState);
    setCompleted(true);
  }

  function reset() {
    setToHitState(null);
    setEffectRoll(null);
    setToHitBoost(0);
    instanceRes.reset();
    setCompleted(false);
    actionIdRef.current = randomId();
  }

  const topLevelActions = instanceRes.usesPerInstanceEach
    ? { onRollToHit: NOOP_ACTION, onCallMiss: NOOP_ACTION, onCallCrit: NOOP_ACTION, onRollEffect: NOOP_ACTION }
    : { onRollToHit, onCallMiss, onCallCrit, onRollEffect };

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
    ...(instanceRes.instances ? { instances: instanceRes.instances, instanceRoll: resolution.instances!.roll } : {}),
    ...topLevelActions,
    boostToHit,
    onComplete,
  };

  return { view, reset };
}
