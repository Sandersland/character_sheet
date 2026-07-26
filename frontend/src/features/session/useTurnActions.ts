/**
 * useTurnActions — the TurnHub dispatch hub.
 *
 * Owns the transient UI state (busy/error/messages + the three menu booleans),
 * composes useActiveResolution(), useTurnActionMutations(), and
 * useManeuverActions(), derives the class-action partitions, and exposes every
 * handler the TurnHub render needs. Keeps TurnHub a thin orchestrator over
 * turnState + this hook.
 */

import { useState } from "react";

import { startCombat, endCombat, advanceCombatRound, fetchCombatState } from "@/api/client";
import { flurryStrikeCount } from "@/lib/attackMath";
import { rollSpec } from "@/lib/dice";
import { planActionClick, type ActionClickPlan } from "@/lib/turnActionPlan";
import {
  bonusSpellOptions,
  classActionOption,
  consumableCount,
  mainWeaponSummary,
  offHandSummary,
  partitionClassActions,
  twfHint,
} from "@/lib/turnOptions";
import { buffsToAutoEnd, endActionKeyFor, endReminders } from "@/lib/turnHooks";
import { equippedLoadoutLabel } from "@/lib/paperDoll";
import { interactionBudgetRemaining } from "@/lib/loadoutPicker";
import { useManeuverActions } from "@/features/session/useManeuverActions";
import { useTurnActionMutations } from "@/features/session/useTurnActionMutations";
import { resolverFor, type ResolutionKind } from "@/features/session/actionResolvers";
import { useActiveResolution } from "@/features/session/useActiveResolution";
import { useLoadoutSwap } from "@/features/session/useLoadoutSwap";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, AvailableAction } from "@/types/character";

export function useTurnActions({
  character,
  sessionId,
  turnState,
  onLogChanged,
}: {
  character: Character;
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  onLogChanged: () => void;
}) {
  const {
    inCombat,
    attackedThisTurn,
    tookDamageThisTurn,
    startCombat: startCombatState,
    endCombat: endCombatState,
    startTurn,
    endTurn,
    consumeAction,
    enterAttackMode,
    consumeBonusAction,
    enterTwfMode,
    enterFlurryMode,
    consumeReaction,
    grantExtraAction,
    history,
    attachBatchId,
    undo,
    syncCombat,
    reconcileCombat,
  } = turnState;

  // Active durable (while-active) self-buffs — drive the turn-hook + End-buff UI.
  const activeDurableBuffKeys = (character.activeEffects?.buffs ?? [])
    .filter((b) => b.duration === "while-active")
    .map((b) => b.key);
  const durableReminders = endReminders(activeDurableBuffKeys);

  const { activeResolution, openResolution, closeResolution } = useActiveResolution();
  // Mid-turn weapon change (#815) — hoisted here so both the resolution sheet
  // and the persistent under-slot Refund strip read one committed-swap state.
  const loadoutSwap = useLoadoutSwap(character, turnState);

  const {
    busy,
    error: mutationError,
    resetErrors,
    sendAction,
    undoBatch,
    spendActionSurge,
    rollInitiative,
  } = useTurnActionMutations(character.id);
  // reactionMessage: last reaction result; effectMessage: effect-maneuver result.
  const [reactionMessage, setReactionMessage] = useState<string | null>(null);
  const [effectMessage, setEffectMessage] = useState<string | null>(null);

  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showBonusMenu, setShowBonusMenu] = useState(false);
  const [showReactionMenu, setShowReactionMenu] = useState(false);

  // Superiority die spend + its handlers — used by the reaction and effect
  // maneuver slots. A maneuver spend surfaces into the same error slot the
  // mutations above use.
  const {
    dieLabel,
    dieBusy,
    superiorityRemaining,
    maneuverError,
    resetManeuverError,
    handleReactionManeuver,
    handleEffectManeuver,
  } = useManeuverActions(character, {
    consumeReaction,
    closeReactionMenu: () => setShowReactionMenu(false),
    setReactionMessage,
    setEffectMessage,
  });
  const error = mutationError ?? maneuverError;

  // Derive available class actions from character data.
  const availableActions: AvailableAction[] = character.availableActions ?? [];
  const raging = activeDurableBuffKeys.includes("rage");
  const { classActions, classBonusActions, classReactions } = partitionClassActions(availableActions, raging);

  // Action Surge pool — Fighter-only resource.
  const actionSurgePool = character.resources?.pools?.find((p) => p.key === "actionSurge");
  const actionSurgeAvailable = (actionSurgePool?.remaining ?? 0) > 0;

  // Render models for the option-card picker sheets (pure turnOptions
  // derivations) — built here so the slot components stay presentational and
  // `character` never flows into them.
  const enrich = (a: AvailableAction) => classActionOption(a, resolverFor(a.key), character);
  const actionSheetModel = {
    attackSummary: mainWeaponSummary(character),
    consumableCount: consumableCount(character),
    hasSpellcasting: character.spellcasting !== undefined,
    classActionOptions: classActions.map(enrich),
    loadoutLabel: equippedLoadoutLabel(character.inventory),
    interactionBudgetRemaining: interactionBudgetRemaining({
      attackEquipCredits: turnState.attackEquipCredits,
      freeInteractionUsed: turnState.freeInteractionUsed,
    }),
  };
  const bonusSheetModel = {
    classBonusOptions: classBonusActions.map(enrich),
    bonusSpells: bonusSpellOptions(character, turnState.spellCastThisTurn),
    twfHintText: twfHint(character),
    offHandSummary: offHandSummary(character),
  };
  const reactionSheetModel = {
    attackSummary: mainWeaponSummary(character),
    hasSpellcasting: character.spellcasting !== undefined,
    classReactionOptions: classReactions.map(enrich),
  };

  // Partition known maneuvers by placement for the Reaction slot and effect strip.
  const maneuversKnown = character.resources?.maneuversKnown ?? [];
  const reactionManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "reaction",
  );
  const effectManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "effect",
  );

  // send() — fires applyActionTransactions via the mutation. The returned
  // batchId is tagged onto the just-pushed history entry so undo can revert this
  // server effect (#758).
  async function send(actionKey: string, opts?: { roll?: number; inventoryItemId?: string }) {
    try {
      const updated = await sendAction(actionKey, opts);
      if (updated.batchId) attachBatchId(updated.batchId);
    } catch {
      // error already carries the message via useTurnActionMutations.
    }
  }

  // handleUndo() — undo the last turn mutation. A server-effect entry (Second
  // Wind, Rage, …) carries a batchId: revert that batch server-side FIRST, then
  // pop the local slot. A local-only entry (Dodge, attack-mode) just pops. On a
  // failed revert (e.g. the batch isn't the latest) surface the error and leave
  // the local slot consumed — never desync the client from the server (#758).
  async function handleUndo() {
    const top = history[history.length - 1];
    if (!top) return;
    if (!top.batchId) {
      undo();
      return;
    }
    try {
      await undoBatch(top.batchId);
      undo();
    } catch {
      // error already carries the message via useTurnActionMutations.
    }
  }

  // Close the menu row for the clicked cost.
  function closeMenuFor(cost: "action" | "bonusAction" | "reaction") {
    if (cost === "action") setShowActionMenu(false);
    else if (cost === "bonusAction") setShowBonusMenu(false);
    else setShowReactionMenu(false);
  }

  // Consume the economy slot for the clicked cost. twf-picker kind actions
  // reaching the generic dispatch (Bonus Unarmed Strike, #1218 — the `twf` key
  // itself never arrives here, see handleTwfAction below) open the
  // single-swing bonusAttack counter instead of a flat consume, so
  // InlineOffHandPicker's pre/post-roll state tracks correctly.
  function consumeSlotFor(cost: "action" | "bonusAction" | "reaction", resolverKind: ResolutionKind | undefined) {
    if (resolverKind === "twf-picker") enterTwfMode();
    else if (cost === "action") consumeAction();
    else if (cost === "bonusAction") consumeBonusAction();
    else consumeReaction();
  }

  // Fire applyActionTransactions per the plan's send mode (none/plain/healRoll).
  function sendForPlan(plan: ActionClickPlan, key: string) {
    if (plan.send === "plain") void send(key);
    else if (plan.send === "healRoll" && plan.healRoll) {
      void send(key, { roll: rollSpec(plan.healRoll).total });
    }
  }

  // No-server-effect reminder actions (e.g. Shadow Step): the rule text is the
  // whole deliverable, so surface it on use.
  function surfaceReminder(key: string, cost: "action" | "bonusAction" | "reaction") {
    const reminder = availableActions.find((a) => a.key === key)?.reminder;
    if (!reminder) return;
    if (cost === "reaction") setReactionMessage(reminder);
    else setEffectMessage(reminder);
  }

  // Action button click handler — plans via planActionClick, then applies effects.
  function handleActionClick(key: string, cost: "action" | "bonusAction" | "reaction") {
    closeMenuFor(cost);
    const resolver = resolverFor(key);
    const plan = planActionClick(resolver, character);
    if (plan.consumeSlot) consumeSlotFor(cost, resolver?.kind);
    sendForPlan(plan, key);
    if (plan.openResolution) openResolution(key);
    surfaceReminder(key, cost);
  }

  // Special path for Attack action — must use enterAttackMode, not consumeAction.
  function handleAttackAction() {
    enterAttackMode();
    openResolution("attack");
    setShowActionMenu(false);
  }

  // Resume a live Attack action left with unspent attacks (#802) — reopen the
  // sheet WITHOUT spending another action (no enterAttackMode).
  function handleResumeAttack() {
    openResolution("attack");
    setShowActionMenu(false);
  }

  // Special path for TWF off-hand — enterTwfMode opens the bonusAttack counter
  // and the twf-picker resolution sheet renders the off-hand roll surface (#732).
  function handleTwfAction() {
    enterTwfMode();
    openResolution("twf");
    setShowBonusMenu(false);
  }

  // Special path for Flurry of Blows (#1217) — bypasses the generic
  // handleActionClick/planActionClick path (like handleTwfAction) because it
  // needs to arm the strike counter via enterFlurryMode. The bonus action is
  // consumed here (reversibly — cancelFlurry refunds it pre-roll, like TWF),
  // but the 1 Focus is deliberately NOT spent here: InlineFlurryPicker fires it
  // exactly once, on the first strike roll, so a cancel-before-rolling loses
  // nothing (a cancel-time "refund" that couldn't return an already-spent
  // Focus Point would lie to the player). Always resolves as Unarmed Strikes
  // only via InlineFlurryPicker, never the weapon attack-picker.
  function handleFlurryAction() {
    consumeBonusAction();
    enterFlurryMode(flurryStrikeCount(character));
    openResolution("flurryOfBlows");
    setShowBonusMenu(false);
  }

  // Bonus-spell card tap — open the cast sheet focused on that spell. Like the
  // generic spell-picker plan, no slot is consumed here; it commits at cast
  // time via onCommitSlot.
  function handleBonusSpellCast(spellId: string) {
    setShowBonusMenu(false);
    openResolution("castSpellBonus", { spellId });
  }

  // Action Surge — server-confirms first, then grants the extra action slot.
  async function handleActionSurge() {
    if (!actionSurgeAvailable || busy) return;
    try {
      await spendActionSurge();
      grantExtraAction();
    } catch {
      // error already carries the message via useTurnActionMutations.
    }
  }

  // Recovery path for a failed startCombat/endCombat (#1030 finding #1): the
  // optimistic local flip already ran but the server was never mutated, so
  // re-fetch the authoritative state and reconcile onto it via
  // `reconcileCombat` (bypasses the monotonic guard deliberately — see its
  // JSDoc). If THIS fetch also fails (the network blip outlasts both calls),
  // we deliberately leave the optimistic (possibly wrong) local state as-is
  // rather than force a guessed value — the two remaining recovery paths
  // (retrying Start/End Combat, or a page reload) already exist for the
  // ordinary out-of-sync case this issue documents, and forcing a guess here
  // would just trade one wrong state for a different one.
  async function reconcileCombatAfterFailure() {
    try {
      const state = await fetchCombatState(character.id, sessionId);
      reconcileCombat(state.round, state.combatActive, state.updatedAt);
    } catch (e) {
      console.error("combat reconcile failed after mutation failure", e);
    }
  }

  // Combat lifecycle — local state first, best-effort audit log after.
  async function handleStartCombat() {
    startCombatState();
    setReactionMessage(null);
    setEffectMessage(null);
    resetManeuverError();
    resetErrors();
    // Automatic combat-start resource regen (#1239/#1243): fires every pool's
    // onInitiative descriptor (today, Monk Uncanny Metabolism/Perfect Focus) —
    // harmless no-op for every other class/level. Separate try/catch from the
    // audit-log call below so one failing best-effort call doesn't block the other.
    try {
      const updated = await rollInitiative();
      // eventData.regenerated is only non-empty when a descriptor actually
      // fired (#1243) — a plain "no resources to regain" roll stays silent.
      const regenerated = updated.results[0]?.eventData.regenerated as unknown[] | undefined;
      if (regenerated && regenerated.length > 0) setEffectMessage(updated.results[0].summary);
    } catch (e) {
      console.error("initiative regen failed (startCombat)", e);
    }
    try {
      // Idempotent server-side (#1030): if combat was already active (another
      // participant started it first), this reconciles round/combatActive to
      // the REAL server state rather than trusting this client's optimistic 1.
      const state = await startCombat(character.id, sessionId);
      syncCombat(state.round, state.combatActive, state.updatedAt);
      onLogChanged();
    } catch (e) {
      console.error("combat log failed (startCombat)", e);
      // The optimistic startCombatState() above never landed server-side —
      // reconcile onto the real state instead of leaving this client stuck
      // showing an encounter the server may not agree exists (#1030 finding #1).
      await reconcileCombatAfterFailure();
    }
  }

  async function handleEndCombat() {
    endCombatState();
    closeResolution();
    loadoutSwap.reset();
    setReactionMessage(null);
    setEffectMessage(null);
    resetManeuverError();
    resetErrors();
    try {
      const state = await endCombat(character.id, sessionId);
      syncCombat(state.round, state.combatActive, state.updatedAt);
      onLogChanged();
    } catch (e) {
      console.error("combat log failed (endCombat)", e);
      // The optimistic endCombatState() above never landed server-side — in a
      // solo session there's no other participant to later correct this via a
      // poll (finding #1), so reconcile onto the real state right away.
      await reconcileCombatAfterFailure();
    }
  }

  // Start turn — clear the turn-scoped messages, then reset the economy.
  function handleStartTurn() {
    setReactionMessage(null);
    setEffectMessage(null);
    resetManeuverError();
    resetErrors();
    startTurn();
  }

  // End turn — clear messages, advance the round, and log the new round.
  async function handleEndTurn() {
    setReactionMessage(null);
    setEffectMessage(null);
    resetManeuverError();
    resetErrors();
    // Evaluate durable-buff end-conditions against this turn's window BEFORE
    // endTurn() resets it. Each expiring buff clears server-side (auto-end).
    const expiring = buffsToAutoEnd(activeDurableBuffKeys, {
      attacked: attackedThisTurn,
      tookDamage: tookDamageThisTurn,
    });
    const wasInCombat = inCombat;
    endTurn(); // local economy reset only — round no longer moves here (#1030)
    closeResolution();
    // Refund is bounded to the turn of the swap — drop it as the turn ends.
    loadoutSwap.reset();
    for (const buffKey of expiring) {
      const actionKey = endActionKeyFor(buffKey);
      if (actionKey) await send(actionKey);
    }
    // The server decides the next round — never a client-computed guess
    // (#1030). syncCombat only applies on success: a failed call must NOT
    // advance the locally-displayed round, or this client would show a round
    // the server never agreed to.
    if (wasInCombat) {
      try {
        const state = await advanceCombatRound(character.id, sessionId);
        syncCombat(state.round, state.combatActive, state.updatedAt);
        onLogChanged();
      } catch (e) {
        console.error("combat log failed (advanceCombatRound)", e);
      }
    }
  }

  return {
    busy,
    error,
    reactionMessage,
    // Exposed alongside the value (#1241) so TurnHub can compose the sibling
    // useDeflectAttacksReaction hook (see that file's header for why it's a
    // sibling rather than nested in here) and write into the same result strip.
    setReactionMessage,
    effectMessage,
    showActionMenu,
    setShowActionMenu,
    showBonusMenu,
    setShowBonusMenu,
    showReactionMenu,
    setShowReactionMenu,
    activeResolution,
    closeResolution,
    loadoutSwap,
    dieLabel,
    dieBusy,
    superiorityRemaining,
    classActions,
    classBonusActions,
    classReactions,
    actionSheetModel,
    bonusSheetModel,
    reactionSheetModel,
    durableReminders,
    reactionManeuvers,
    effectManeuvers,
    actionSurgePool,
    actionSurgeAvailable,
    send,
    handleUndo,
    handleActionClick,
    handleAttackAction,
    handleResumeAttack,
    handleTwfAction,
    handleFlurryAction,
    handleBonusSpellCast,
    handleActionSurge,
    handleStartCombat,
    handleEndCombat,
    handleStartTurn,
    handleEndTurn,
    handleReactionManeuver,
    handleEffectManeuver,
  };
}
