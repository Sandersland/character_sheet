/**
 * useTurnActions — the TurnHub dispatch hub.
 *
 * Owns the transient UI state (busy/error/messages + the three menu booleans),
 * composes useActiveResolution() and useManeuverDie(), derives the class-action
 * partitions, and exposes every handler the TurnHub render needs. Keeps TurnHub
 * a thin orchestrator over turnState + this hook.
 */

import { useState } from "react";

import { applyActionTransactions, revertBatch, startCombat, endCombat, advanceCombatRound } from "@/api/client";
import { rollSpec } from "@/lib/dice";
import { planActionClick, type ActionClickPlan } from "@/lib/turnActionPlan";
import {
  bonusSpellOptions,
  classActionOption,
  consumableCount,
  mainWeaponSummary,
  offHandSummary,
  twfHint,
} from "@/lib/turnOptions";
import { buffsToAutoEnd, endActionKeyFor, endReminders } from "@/lib/turnHooks";
import { equippedLoadoutLabel } from "@/lib/paperDoll";
import { interactionBudgetRemaining } from "@/lib/loadoutPicker";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { resolverFor, type ResolutionKind } from "@/features/session/actionResolvers";
import { useActiveResolution } from "@/features/session/useActiveResolution";
import { useLoadoutSwap } from "@/features/session/useLoadoutSwap";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, AvailableAction } from "@/types/character";

export function useTurnActions({
  character,
  sessionId,
  turnState,
  onUpdate,
  onLogChanged,
}: {
  character: Character;
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
}) {
  const {
    inCombat,
    round,
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
    consumeReaction,
    grantExtraAction,
    history,
    attachBatchId,
    undo,
  } = turnState;

  // Active durable (while-active) self-buffs — drive the turn-hook + End-buff UI.
  const activeDurableBuffKeys = (character.activeEffects?.buffs ?? [])
    .filter((b) => b.duration === "while-active")
    .map((b) => b.key);
  const durableReminders = endReminders(activeDurableBuffKeys);

  const { activeResolution, openResolution, closeResolution } = useActiveResolution();
  // Mid-turn weapon change (#815) — hoisted here so both the resolution sheet
  // and the persistent under-slot Refund strip read one committed-swap state.
  const loadoutSwap = useLoadoutSwap(character, turnState, onUpdate);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // reactionMessage: last reaction result; effectMessage: effect-maneuver result.
  const [reactionMessage, setReactionMessage] = useState<string | null>(null);
  const [effectMessage, setEffectMessage] = useState<string | null>(null);

  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showBonusMenu, setShowBonusMenu] = useState(false);
  const [showReactionMenu, setShowReactionMenu] = useState(false);

  // Superiority die spend helper — used by reaction and effect maneuvers.
  const { pool: superiorityPool, dieLabel, busy: dieBusy, spend: spendDie } =
    useManeuverDie(character, onUpdate);

  // Derive available class actions from character data.
  const availableActions: AvailableAction[] = character.availableActions ?? [];
  const raging = activeDurableBuffKeys.includes("rage");
  const classActions = availableActions.filter((a) => a.cost === "action");
  // While raging, swap the Rage affordance for End Rage (both are bonus actions).
  const classBonusActions = availableActions.filter(
    (a) => a.cost === "bonusAction" && a.key !== (raging ? "rage" : "endRage"),
  );
  const classReactions = availableActions.filter((a) => a.cost === "reaction");

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
  const superiorityRemaining = superiorityPool?.remaining ?? 0;

  // send() — fires applyActionTransactions then calls onUpdate. The returned
  // batchId is tagged onto the just-pushed history entry so undo can revert this
  // server effect (#758).
  async function send(actionKey: string, opts?: { roll?: number; inventoryItemId?: string }) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyActionTransactions(character.id, [
        { type: "executeAction", actionKey, ...opts },
      ]);
      onUpdate(updated);
      if (updated.batchId) attachBatchId(updated.batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
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
    setBusy(true);
    setError(null);
    try {
      const reverted = await revertBatch(character.id, top.batchId);
      onUpdate(reverted);
      undo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed.");
    } finally {
      setBusy(false);
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

  // No-server-effect reminder actions (Shadow Step, Opportunist): the rule
  // text is the whole deliverable, so surface it on use.
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
    setBusy(true);
    setError(null);
    try {
      const updated = await applyActionTransactions(character.id, [
        { type: "executeAction", actionKey: "actionSurge" },
      ]);
      onUpdate(updated);
      grantExtraAction();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action Surge failed.");
    } finally {
      setBusy(false);
    }
  }

  // Combat lifecycle — local state first, best-effort audit log after.
  async function handleStartCombat() {
    startCombatState();
    try {
      await startCombat(character.id, sessionId);
      onLogChanged();
    } catch (e) {
      console.error("combat log failed (startCombat)", e);
    }
  }

  async function handleEndCombat() {
    endCombatState();
    closeResolution();
    loadoutSwap.reset();
    setReactionMessage(null);
    setEffectMessage(null);
    setError(null);
    try {
      await endCombat(character.id, sessionId);
      onLogChanged();
    } catch (e) {
      console.error("combat log failed (endCombat)", e);
    }
  }

  // Start turn — clear the turn-scoped messages, then reset the economy.
  function handleStartTurn() {
    setReactionMessage(null);
    setEffectMessage(null);
    setError(null);
    startTurn();
  }

  // End turn — clear messages, advance the round, and log the new round.
  async function handleEndTurn() {
    setReactionMessage(null);
    setEffectMessage(null);
    setError(null);
    // Evaluate durable-buff end-conditions against this turn's window BEFORE
    // endTurn() resets it. Each expiring buff clears server-side (auto-end).
    const expiring = buffsToAutoEnd(activeDurableBuffKeys, {
      attacked: attackedThisTurn,
      tookDamage: tookDamageThisTurn,
    });
    // endTurn() increments round when inCombat — capture the new round number.
    const nextRound = inCombat ? round + 1 : undefined;
    endTurn();
    closeResolution();
    // Refund is bounded to the turn of the swap — drop it as the turn ends.
    loadoutSwap.reset();
    for (const buffKey of expiring) {
      const actionKey = endActionKeyFor(buffKey);
      if (actionKey) await send(actionKey);
    }
    // Log the new round beginning (round 1 is logged by combatStarted).
    if (inCombat && nextRound !== undefined && nextRound >= 2) {
      try {
        await advanceCombatRound(character.id, sessionId, nextRound);
        onLogChanged();
      } catch (e) {
        console.error("combat log failed (advanceCombatRound)", e);
      }
    }
  }

  async function handleReactionManeuver(entryId: string, maneuverName: string) {
    if (dieBusy || superiorityRemaining === 0) return;
    setError(null);
    try {
      const dieResult = await spendDie(entryId);
      consumeReaction();
      setShowReactionMenu(false);
      if (maneuverName === "Parry") {
        setReactionMessage(
          `Parry — reduce incoming damage by ${dieResult} + DEX modifier (${dieLabel} rolled ${dieResult}).`,
        );
      } else if (maneuverName === "Riposte") {
        setReactionMessage(
          `Riposte — make one melee attack against the creature; add +${dieResult} to the damage roll (${dieLabel} rolled ${dieResult}).`,
        );
      } else {
        setReactionMessage(
          `${maneuverName} — tell your DM: rolled ${dieResult} on ${dieLabel}.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `${maneuverName} failed.`);
    }
  }

  async function handleEffectManeuver(entryId: string, maneuverName: string) {
    if (dieBusy || superiorityRemaining === 0) return;
    setError(null);
    try {
      const dieResult = await spendDie(entryId);
      if (maneuverName === "Evasive Footwork") {
        setEffectMessage(
          `Evasive Footwork — add +${dieResult} to your AC until the end of your turn (${dieLabel} rolled ${dieResult}).`,
        );
      } else if (maneuverName === "Rally") {
        setEffectMessage(
          `Rally — gained temporary HP (${dieLabel} rolled ${dieResult} + your CHA modifier).`,
        );
      } else {
        setEffectMessage(
          `${maneuverName} — tell your DM: rolled ${dieResult} on ${dieLabel}.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `${maneuverName} failed.`);
    }
  }

  return {
    busy,
    error,
    reactionMessage,
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
