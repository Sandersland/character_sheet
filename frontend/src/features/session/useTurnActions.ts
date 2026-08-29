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
import { useUniversalActions } from "@/hooks/useUniversalActions";
import { useManeuverActions } from "@/features/session/useManeuverActions";
import { useTurnActionMutations } from "@/features/session/useTurnActionMutations";
import { resolverFor, type ActionResolver, type ResolutionKind } from "@/features/session/actionResolvers";
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

  const activeDurableBuffKeys = (character.activeEffects?.buffs ?? [])
    .filter((b) => b.duration === "while-active")
    .map((b) => b.key);
  const durableReminders = endReminders(activeDurableBuffKeys);

  const { activeResolution, openResolution, closeResolution } = useActiveResolution();
  // Hoisted here (not in the resolution sheet) so both the sheet and the persistent Refund strip read one committed-swap state (#815).
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
  const [reactionMessage, setReactionMessage] = useState<string | null>(null);
  const [effectMessage, setEffectMessage] = useState<string | null>(null);

  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showBonusMenu, setShowBonusMenu] = useState(false);
  const [showReactionMenu, setShowReactionMenu] = useState(false);

  // A maneuver spend surfaces into the same error slot the mutations above use (see `error` below).
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

  const availableActions: AvailableAction[] = character.availableActions ?? [];
  const raging = activeDurableBuffKeys.includes("rage");
  const { classActions, classBonusActions, classReactions } = partitionClassActions(availableActions, raging);

  const actionSurgePool = character.resources?.pools?.find((p) => p.key === "actionSurge");
  const actionSurgeAvailable = (actionSurgePool?.remaining ?? 0) > 0;

  // universalActions must be read before `enrich` — a class row's `regrants` keys resolve to names against these rows (#1431).
  const universalActions = useUniversalActions(character.rulesEdition);
  const enrich = (a: AvailableAction) =>
    classActionOption(a, resolverFor(a.key, a), character, universalActions);
  const actionSheetModel = {
    attackSummary: mainWeaponSummary(character),
    universalActions,
    consumableCount: consumableCount(character),
    hasSpellcasting: character.spellcasting !== undefined,
    classActionOptions: classActions.map(enrich),
    loadoutLabel: equippedLoadoutLabel(character.inventory, character.offHandLocked),
    interactionBudgetRemaining: interactionBudgetRemaining({
      attackEquipCredits: turnState.attackEquipCredits,
      freeInteractionUsed: turnState.freeInteractionUsed,
    }),
  };
  const bonusSheetModel = {
    classBonusOptions: classBonusActions.map(enrich),
    bonusSpells: bonusSpellOptions(character, turnState.spellEconomy),
    twfHintText: twfHint(character),
    offHandSummary: offHandSummary(character),
  };
  const reactionSheetModel = {
    attackSummary: mainWeaponSummary(character),
    universalActions,
    hasSpellcasting: character.spellcasting !== undefined,
    classReactionOptions: classReactions.map(enrich),
  };

  const maneuversKnown = character.resources?.maneuversKnown ?? [];
  const reactionManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "reaction",
  );
  const effectManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "effect",
  );

  // batchId is tagged onto the just-pushed history entry so undo can revert this server effect (#758); returns the first op's result (#1528) or undefined on failure/no report.
  async function send(actionKey: string, opts?: { roll?: number; inventoryItemId?: string; slotLevel?: number }) {
    try {
      const updated = await sendAction(actionKey, opts);
      if (updated.batchId) attachBatchId(updated.batchId);
      return updated.results?.[0];
    } catch {
      return undefined;
    }
  }

  // A batchId entry reverts server-side first, then pops locally; a failed revert leaves the local slot consumed rather than desync from the server (#758).
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
      // Eager refresh — a no-persisted-change revert returns a reference-identical character, so the character-write bump alone wouldn't clear the reverted line from the log (#758).
      onLogChanged();
    } catch {
      // error already carries the message via useTurnActionMutations.
    }
  }

  function closeMenuFor(cost: "action" | "bonusAction" | "reaction") {
    if (cost === "action") setShowActionMenu(false);
    else if (cost === "bonusAction") setShowBonusMenu(false);
    else setShowReactionMenu(false);
  }

  // twf-picker actions (Bonus Unarmed Strike, #1218) open the bonusAttack counter instead of a flat consume, so InlineOffHandPicker's pre/post-roll state tracks correctly.
  function consumeSlotFor(cost: "action" | "bonusAction" | "reaction", resolverKind: ResolutionKind | undefined) {
    if (resolverKind === "twf-picker") enterTwfMode();
    else if (cost === "action") consumeAction();
    else if (cost === "bonusAction") consumeBonusAction();
    else consumeReaction();
  }

  // Split out of sendForPlan to stay under fallow's cyclomatic/CRAP budget — merging back in trips the gate.
  function surfaceServerRoll(
    key: string,
    resolver: ActionResolver | undefined,
    roll: number | undefined,
    cost: "action" | "bonusAction" | "reaction",
  ) {
    if (resolver?.kind !== "heal-roll" || roll === undefined) return;
    const name = availableActions.find((a) => a.key === key)?.name ?? key;
    const message = `${name}: healed ${roll} HP.`;
    if (cost === "reaction") setReactionMessage(message);
    else setEffectMessage(message);
  }

  async function sendForPlan(
    plan: ActionClickPlan,
    key: string,
    resolver: ActionResolver | undefined,
    cost: "action" | "bonusAction" | "reaction",
  ) {
    if (plan.send === "plain") {
      const result = await send(key);
      surfaceServerRoll(key, resolver, result?.roll, cost);
    } else if (plan.send === "healRoll" && plan.healRoll) {
      void send(key, { roll: rollSpec(plan.healRoll).total });
    }
  }

  // Action Surge's served cost is "special" (#1852) — only "reaction" routes to the reaction strip; everything else goes to the effect strip.
  function surfaceReminder(key: string, cost: AvailableAction["cost"]) {
    const reminder = availableActions.find((a) => a.key === key)?.reminder;
    if (!reminder) return;
    if (cost === "reaction") setReactionMessage(reminder);
    else setEffectMessage(reminder);
  }

  function handleActionClick(key: string, cost: "action" | "bonusAction" | "reaction") {
    closeMenuFor(cost);
    // resolverFor(key, action) — action is the #1528 fallback context for a row-driven key with no ACTION_RESOLVERS entry.
    const action = availableActions.find((a) => a.key === key);
    const resolver = resolverFor(key, action);
    const plan = planActionClick(resolver, character);
    if (plan.consumeSlot) consumeSlotFor(cost, resolver?.kind);
    void sendForPlan(plan, key, resolver, cost);
    // action is passed through so openResolution's own resolverFor call can synthesize a row-driven resolver too (#1676).
    if (plan.openResolution) openResolution(key, undefined, action);
    surfaceReminder(key, cost);
  }

  function handleAttackAction() {
    enterAttackMode();
    openResolution("attack");
    setShowActionMenu(false);
  }

  // Reopens the sheet without spending another action (no enterAttackMode) — resumes unspent attacks left mid-turn (#802).
  function handleResumeAttack() {
    openResolution("attack");
    setShowActionMenu(false);
  }

  function handleTwfAction() {
    enterTwfMode();
    openResolution("twf");
    setShowBonusMenu(false);
  }

  // The bonus action is consumed here but reversibly — cancelFlurry refunds it pre-roll, like TWF.
  // The Focus Point is deliberately not spent here — InlineFlurryPicker spends it once on the first strike roll, so a pre-roll cancel loses nothing.
  function handleFlurryAction() {
    consumeBonusAction();
    enterFlurryMode(flurryStrikeCount(character));
    openResolution("flurryOfBlows");
    setShowBonusMenu(false);
  }

  // No slot is consumed here, unlike other handlers — it commits at cast time via onCommitSlot, like the generic spell-picker plan.
  function handleBonusSpellCast(spellId: string) {
    setShowBonusMenu(false);
    openResolution("castSpellBonus", { spellId });
  }

  async function handleActionSurge() {
    if (!actionSurgeAvailable || busy) return;
    try {
      await spendActionSurge();
      grantExtraAction();
      // The served actionSurge card carries a reminder only when attached server-side (Arcane Charge, Eldritch Knight L15+ PHB'14) — surfaceReminder no-ops otherwise (#1852).
      surfaceReminder("actionSurge", "special");
    } catch {
      // error already carries the message via useTurnActionMutations.
    }
  }

  // reconcileCombat bypasses the monotonic guard deliberately (see its own JSDoc).
  // If this reconcile fetch also fails, the optimistic local state is deliberately left as-is rather than force a guessed value (#1030 finding #1).
  async function reconcileCombatAfterFailure() {
    try {
      const state = await fetchCombatState(character.id, sessionId);
      reconcileCombat(state.round, state.combatActive, state.updatedAt, state.spellEconomy);
    } catch (e) {
      console.error("combat reconcile failed after mutation failure", e);
    }
  }

  async function handleStartCombat() {
    startCombatState();
    setReactionMessage(null);
    setEffectMessage(null);
    resetManeuverError();
    resetErrors();
    // Separate try/catch from the audit-log call below so one failing best-effort call doesn't block the other (#1239/#1243).
    try {
      const updated = await rollInitiative();
      // eventData.regenerated is only non-empty when a descriptor actually fired — a plain roll with nothing to regain stays silent (#1243).
      const regenerated = updated.results[0]?.eventData.regenerated as unknown[] | undefined;
      if (regenerated && regenerated.length > 0) setEffectMessage(updated.results[0].summary);
    } catch (e) {
      console.error("initiative regen failed (startCombat)", e);
    }
    try {
      // Idempotent server-side (#1030) — if combat was already active (another participant started it), this reconciles to the real server state rather than trusting the optimistic local start.
      const state = await startCombat(character.id, sessionId);
      syncCombat(state.round, state.combatActive, state.updatedAt, state.spellEconomy);
      onLogChanged();
    } catch (e) {
      console.error("combat log failed (startCombat)", e);
      // The optimistic startCombatState() never landed server-side — reconcile onto the real state rather than show an encounter the server may not agree exists (#1030 finding #1).
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
      syncCombat(state.round, state.combatActive, state.updatedAt, state.spellEconomy);
      onLogChanged();
    } catch (e) {
      console.error("combat log failed (endCombat)", e);
      // The optimistic endCombatState() never landed server-side and a solo session has no other participant to correct it via poll — reconcile right away (#1030 finding #1).
      await reconcileCombatAfterFailure();
    }
  }

  function handleStartTurn() {
    setReactionMessage(null);
    setEffectMessage(null);
    resetManeuverError();
    resetErrors();
    startTurn();
  }

  async function handleEndTurn() {
    setReactionMessage(null);
    setEffectMessage(null);
    resetManeuverError();
    resetErrors();
    // Must evaluate durable-buff end-conditions BEFORE endTurn() resets the turn window, or expiring buffs can't be detected.
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
    // The server decides the next round (#1030) — syncCombat only runs on success, so a failed call never advances the locally-displayed round.
    if (wasInCombat) {
      try {
        const state = await advanceCombatRound(character.id, sessionId);
        syncCombat(state.round, state.combatActive, state.updatedAt, state.spellEconomy);
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
    // Exposed alongside the value so TurnHub can compose the sibling useDeflectAttacksReaction hook into the same result strip (#1241).
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
