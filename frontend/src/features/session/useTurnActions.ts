/**
 * useTurnActions — the TurnHub dispatch hub.
 *
 * Owns the transient UI state (busy/error/messages + the three menu booleans),
 * composes useActiveResolution() and useManeuverDie(), derives the class-action
 * partitions, and exposes every handler the TurnHub render needs. Keeps TurnHub
 * a thin orchestrator over turnState + this hook.
 */

import { useState } from "react";

import { applyActionTransactions, startCombat, endCombat, advanceCombatRound } from "@/api/client";
import { rollSpec } from "@/lib/dice";
import { buffsToAutoEnd, endActionKeyFor, endReminders } from "@/lib/turnHooks";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { resolverFor } from "@/features/session/actionResolvers";
import { useActiveResolution } from "@/features/session/useActiveResolution";
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
  } = turnState;

  // Active durable (while-active) self-buffs — drive the turn-hook + End-buff UI.
  const activeDurableBuffKeys = (character.activeEffects?.buffs ?? [])
    .filter((b) => b.duration === "while-active")
    .map((b) => b.key);
  const durableReminders = endReminders(activeDurableBuffKeys);

  const { activeResolution, openResolution, closeResolution } = useActiveResolution();

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

  // Partition known maneuvers by placement for the Reaction slot and effect strip.
  const maneuversKnown = character.resources?.maneuversKnown ?? [];
  const reactionManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "reaction",
  );
  const effectManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "effect",
  );
  const superiorityRemaining = superiorityPool?.remaining ?? 0;

  // send() — fires applyActionTransactions then calls onUpdate.
  async function send(actionKey: string, opts?: { roll?: number; inventoryItemId?: string }) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyActionTransactions(character.id, [
        { type: "executeAction", actionKey, ...opts },
      ]);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  // Action button click handler — routes through the resolver registry.
  function handleActionClick(key: string, cost: "action" | "bonusAction" | "reaction") {
    const resolver = resolverFor(key);

    // Close the menu row that was open.
    if (cost === "action") setShowActionMenu(false);
    else if (cost === "bonusAction") setShowBonusMenu(false);
    else if (cost === "reaction") setShowReactionMenu(false);

    if (!resolver) {
      // No resolver — just consume the slot.
      if (cost === "action") consumeAction();
      else if (cost === "bonusAction") consumeBonusAction();
      else if (cost === "reaction") consumeReaction();
      return;
    }

    switch (resolver.kind) {
      case "attack-picker":
        // Class attack-pickers consume their slot and open the inline picker;
        // the main "attack" action goes through handleAttackAction instead.
        if (cost === "action") consumeAction();
        else if (cost === "bonusAction") consumeBonusAction();
        else if (cost === "reaction") consumeReaction();
        if (resolver.serverEffect) void send(key);
        openResolution(key);
        break;

      case "heal-roll": {
        // e.g. Second Wind — consume bonus slot, roll the dice, send with total.
        if (cost === "action") consumeAction();
        else if (cost === "bonusAction") consumeBonusAction();
        else if (cost === "reaction") consumeReaction();
        if (resolver.healRoll) {
          const spec = resolver.healRoll(character);
          const result = rollSpec(spec);
          void send(key, { roll: result.total });
        }
        break;
      }

      case "heal-input":
        // e.g. Lay on Hands — consume action, open the numeric input inline.
        if (cost === "action") consumeAction();
        else if (cost === "bonusAction") consumeBonusAction();
        else if (cost === "reaction") consumeReaction();
        openResolution(key);
        break;

      case "item-picker":
        if (cost === "action") consumeAction();
        else if (cost === "bonusAction") consumeBonusAction();
        else if (cost === "reaction") consumeReaction();
        openResolution(key);
        break;

      case "spell-picker":
        // Do NOT consume the slot here — InlineSpellPicker commits it on cast.
        openResolution(key);
        break;

      case "simple-confirm":
        if (cost === "action") consumeAction();
        else if (cost === "bonusAction") consumeBonusAction();
        else if (cost === "reaction") consumeReaction();
        if (resolver.serverEffect) {
          void send(key);
        }
        break;
    }
  }

  // Special path for Attack action — must use enterAttackMode, not consumeAction.
  function handleAttackAction() {
    enterAttackMode();
    openResolution("attack");
    setShowActionMenu(false);
  }

  // Special path for TWF off-hand — enterTwfMode opens the bonusAttack counter.
  function handleTwfAction() {
    enterTwfMode();
    setShowBonusMenu(false);
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
    dieLabel,
    dieBusy,
    superiorityRemaining,
    classActions,
    classBonusActions,
    classReactions,
    durableReminders,
    reactionManeuvers,
    effectManeuvers,
    actionSurgePool,
    actionSurgeAvailable,
    send,
    handleActionClick,
    handleAttackAction,
    handleTwfAction,
    handleActionSurge,
    handleStartCombat,
    handleEndCombat,
    handleStartTurn,
    handleEndTurn,
    handleReactionManeuver,
    handleEffectManeuver,
  };
}
