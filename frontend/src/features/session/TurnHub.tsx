/**
 * TurnHub — turn-economy orchestrator for the SessionPage. The primary turn
 * panel. Features:
 *   - useActiveResolution() for inline-tool state (replaces the three
 *     show*Menu booleans and the fragile onAttackRolled callback prop).
 *   - send() helper that calls applyActionTransactions for every server-
 *     side action effect (Second Wind, Lay on Hands, Action Surge, etc.).
 *   - InlineAttackPicker: weapon list rendered inline below the slots.
 *   - InlineItemPicker: consumable list rendered inline below the slots.
 *   - LayOnHandsInput: numeric pool draw inline for Lay on Hands.
 *
 * Gating:
 *   - Idle phase: only "Start Turn" prompt + the Reaction slot (reactions
 *     fire on other creatures' turns, so they stay available when idle).
 *   - Active phase: all three slots with their menus and inline tools.
 *
 * ⚑ Movement tracking is intentionally excluded (flagged for a future phase).
 * ⚑ Per-class bonus-action specifics (Rage button, Cunning Action, etc.) and
 *   spell-picker integration are Phase D (PR4 adds InlineSpellPicker).
 */

import { useState } from "react";

import Card from "@/components/ui/Card";
import { applyActionTransactions, startCombat, endCombat, advanceCombatRound } from "@/api/client";
import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import { rollSpec } from "@/lib/dice";
import { maneuverPlacement } from "@/lib/maneuvers";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { resolverFor } from "@/features/session/actionResolvers";
import { useActiveResolution } from "@/features/session/useActiveResolution";
import { SlotPip, QuickBtn, AttackCounter, ReactionResult } from "@/features/session/TurnControls";
import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import InlineItemPicker from "@/features/session/InlineItemPicker";
import InlineSpellPicker from "@/features/session/InlineSpellPicker";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, AvailableAction } from "@/types/character";

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * The Reaction economy slot — shared between idle and active render branches
 * so both always show the same state and the same result strip.
 */
function ReactionSlot({
  reactionUsed,
  showReactionMenu,
  setShowReactionMenu,
  classReactions,
  reactionManeuvers,
  superiorityRemaining,
  dieLabel,
  dieBusy,
  busy,
  reactionMessage,
  error,
  handleActionClick,
  handleReactionManeuver,
}: {
  reactionUsed: boolean;
  showReactionMenu: boolean;
  setShowReactionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  classReactions: AvailableAction[];
  reactionManeuvers: Array<{ id: string; name: string }>;
  superiorityRemaining: number;
  dieLabel: string;
  dieBusy: boolean;
  busy: boolean;
  reactionMessage: string | null;
  error: string | null;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
  handleReactionManeuver: (name: string) => Promise<void>;
}) {
  return (
    <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlotPip filled={!reactionUsed} />
          <span className="text-sm font-semibold text-parchment-800">Reaction</span>
          {reactionUsed ? (
            <span className="text-xs text-parchment-600 italic">used</span>
          ) : (
            <span className="text-xs text-parchment-600">available</span>
          )}
        </div>
        {!reactionUsed && (
          <button
            type="button"
            onClick={() => setShowReactionMenu((v) => !v)}
            className="text-xs font-medium text-garnet-700 hover:underline"
          >
            {showReactionMenu ? "Hide" : "Use Reaction ▾"}
          </button>
        )}
      </div>

      {showReactionMenu && !reactionUsed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {classReactions.map((a) => (
            <QuickBtn
              key={a.key}
              tone={a.enabled ? "arcane" : "neutral"}
              disabled={!a.enabled || busy}
              onClick={() => handleActionClick(a.key, "reaction")}
              title={a.disabledReason}
            >
              {a.name}
            </QuickBtn>
          ))}
          {UNIVERSAL_ACTIONS.filter(
            (u) =>
              u.cost === "reaction" &&
              !classReactions.some((c) => c.key === u.key),
          ).map((u) => (
            <QuickBtn
              key={u.key}
              onClick={() => handleActionClick(u.key, "reaction")}
              title={u.description}
            >
              {u.label}
            </QuickBtn>
          ))}
          {/* Battle Master reaction maneuvers (Parry, Riposte) */}
          {reactionManeuvers.map((m) => (
            <QuickBtn
              key={m.id}
              tone={superiorityRemaining > 0 ? "gold" : "neutral"}
              disabled={superiorityRemaining === 0 || dieBusy}
              onClick={() => handleReactionManeuver(m.name)}
              title={
                superiorityRemaining === 0
                  ? "No superiority dice remaining."
                  : `Spend ${dieLabel} — ${m.name}`
              }
            >
              {m.name} ({dieLabel})
            </QuickBtn>
          ))}
        </div>
      )}

      {/* Error: show when something went wrong (e.g. die spend failed before reaction was consumed). */}
      {!reactionUsed && error && <ReactionResult message={error} tone="garnet" />}
      {/* Result: show after the reaction is spent. */}
      {reactionUsed && <ReactionResult message={reactionMessage} />}
    </div>
  );
}

// ── Lay on Hands inline input ─────────────────────────────────────────────────

function LayOnHandsInput({
  character,
  onSend,
  onClose,
}: {
  character: Character;
  onSend: (actionKey: string, opts?: { roll?: number }) => Promise<void>;
  onClose: () => void;
}) {
  const pool = character.resources?.pools?.find((p) => p.key === "layOnHands");
  const maxPool = pool?.remaining ?? 0;
  const [amount, setAmount] = useState(Math.min(1, maxPool));
  const [busy, setBusy] = useState(false);

  async function handleHeal() {
    if (amount <= 0 || amount > maxPool || busy) return;
    setBusy(true);
    try {
      await onSend("layOnHands", { roll: amount });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-3 rounded-control border border-vitality-200 bg-vitality-50 px-3 py-2">
      <span className="text-xs font-semibold text-vitality-700">
        Lay on Hands — pool remaining: {maxPool}
      </span>
      <input
        type="number"
        min={1}
        max={maxPool}
        value={amount}
        onChange={(e) => setAmount(Math.min(maxPool, Math.max(1, Number(e.target.value))))}
        className="w-16 rounded-control border border-vitality-300 bg-parchment-50 px-2 py-1 text-center text-sm tabular-nums text-parchment-900 focus:outline-none focus:ring-1 focus:ring-vitality-400"
        aria-label="Healing amount"
      />
      <QuickBtn
        tone="neutral"
        disabled={busy || amount <= 0 || amount > maxPool}
        onClick={handleHeal}
      >
        Heal
      </QuickBtn>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-xs text-parchment-600 hover:text-parchment-600"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main TurnHub ──────────────────────────────────────────────────────────────

interface TurnHubProps {
  character: Character;
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  onUpdate: (c: Character) => void;
  /** Called after a combat log event so the Log tab refreshes. */
  onLogChanged: () => void;
}

export default function TurnHub({ character, sessionId, turnState, onUpdate, onLogChanged }: TurnHubProps) {
  const {
    inCombat,
    round,
    phase,
    actionsRemaining,
    bonusActionUsed,
    reactionUsed,
    attack,
    bonusAttack,
    twfAvailable,
    spellCastThisTurn,
    startCombat: startCombatState,
    endCombat: endCombatState,
    startTurn,
    endTurn,
    consumeAction,
    enterAttackMode,
    cancelAttack,
    finishAttack,
    consumeBonusAction,
    enterTwfMode,
    consumeReaction,
    grantExtraAction,
    commitActionSpell,
    commitBonusActionSpell,
    commitReactionSpell,
  } = turnState;

  const { activeResolution, openResolution, closeResolution } = useActiveResolution();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // reactionMessage: result of the last reaction used (shown in ReactionSlot).
  // effectMessage:   result of effect maneuvers like Evasive Footwork (shown in active info strip).
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
  const classActions = availableActions.filter((a) => a.cost === "action");
  const classBonusActions = availableActions.filter((a) => a.cost === "bonusAction");
  const classReactions = availableActions.filter((a) => a.cost === "reaction");

  // Action Surge pool — Fighter-only resource.
  const actionSurgePool = character.resources?.pools?.find((p) => p.key === "actionSurge");
  const actionSurgeAvailable = (actionSurgePool?.remaining ?? 0) > 0;

  // Partition known maneuvers by placement for the Reaction slot and effect strip.
  const maneuversKnown = character.resources?.maneuversKnown ?? [];
  const reactionManeuvers = maneuversKnown.filter(
    (m) => maneuverPlacement(m.name) === "reaction",
  );
  const effectManeuvers = maneuversKnown.filter(
    (m) => maneuverPlacement(m.name) === "effect",
  );
  const superiorityRemaining = superiorityPool?.remaining ?? 0;

  // ── send() helper — fires applyActionTransactions then calls onUpdate ─────

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

  // ── Action button click handler — routes through the resolver registry ────

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
        // Class attack-pickers (Flurry of Blows, Opportunity Attack) consume
        // their slot and open the inline picker. The main "attack" action goes
        // through handleAttackAction (enterAttackMode) and never reaches here.
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
        // Do NOT consume the slot here — it's committed by InlineSpellPicker
        // on successful cast (so opening the picker without casting wastes nothing).
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

  // Special path for TWF off-hand — must use enterTwfMode to open the bonusAttack counter.
  // TWF is ephemeral (no server effect) — the attack rolls themselves are the actions.
  function handleTwfAction() {
    enterTwfMode();
    setShowBonusMenu(false);
    // The bonusAttack counter is rendered inline; no inline picker needed for TWF —
    // the player uses the InlineAttackPicker from the main attack action, or rolls
    // directly using attack buttons. TWF off-hand is tracked via bonusAttack counter only.
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

  // ── Combat lifecycle handlers ─────────────────────────────────────────────

  async function handleStartCombat() {
    startCombatState();
    // Best-effort: log the event to the audit log, but don't block local state.
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

  // ── Reaction maneuver handler ──────────────────────────────────────────────

  async function handleReactionManeuver(maneuverName: string) {
    if (dieBusy || superiorityRemaining === 0) return;
    try {
      const dieResult = await spendDie();
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

  // ── Effect maneuver handler (no slot consumed) ─────────────────────────────

  async function handleEffectManeuver(maneuverName: string) {
    if (dieBusy || superiorityRemaining === 0) return;
    try {
      const dieResult = await spendDie();
      if (maneuverName === "Evasive Footwork") {
        setEffectMessage(
          `Evasive Footwork — add +${dieResult} to your AC until the end of your turn (${dieLabel} rolled ${dieResult}).`,
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

  // ── Idle state ─────────────────────────────────────────────────────────────
  if (phase === "idle") {
    // Not in combat — show only the Start Combat gate.
    if (!inCombat) {
      return (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-parchment-800">Not in Combat</p>
              <p className="mt-0.5 text-xs text-parchment-600">
                When a combat encounter begins, start it here to track your turn.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartCombat}
              className="shrink-0 rounded-control border border-garnet-300 bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 shadow-sm transition-colors hover:bg-garnet-800"
            >
              Start Combat
            </button>
          </div>
        </Card>
      );
    }

    // In combat but between turns — show round indicator, Start Turn, End Combat, Reaction.
    return (
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-parchment-800">
                Combat — Round {round}
              </p>
              <p className="mt-0.5 text-xs text-parchment-600">
                When the DM calls your turn, start tracking your action economy.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleEndCombat}
                className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100"
              >
                End Combat
              </button>
              <button
                type="button"
                onClick={() => {
                  setReactionMessage(null);
                  setEffectMessage(null);
                  setError(null);
                  startTurn();
                }}
                className="rounded-control border border-garnet-300 bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 shadow-sm transition-colors hover:bg-garnet-800"
              >
                Start Turn
              </button>
            </div>
          </div>

          {/* Reaction is available between turns — render it in idle mode. */}
          <ReactionSlot
            reactionUsed={reactionUsed}
            showReactionMenu={showReactionMenu}
            setShowReactionMenu={setShowReactionMenu}
            classReactions={classReactions}
            reactionManeuvers={reactionManeuvers}
            superiorityRemaining={superiorityRemaining}
            dieLabel={dieLabel}
            dieBusy={dieBusy}
            busy={busy}
            reactionMessage={reactionMessage}
            error={error}
            handleActionClick={handleActionClick}
            handleReactionManeuver={handleReactionManeuver}
          />
        </div>
      </Card>
    );
  }

  // ── Active state ────────────────────────────────────────────────────────────

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-parchment-800">Your Turn</p>
          {inCombat && (
            <p className="mt-0.5 text-xs text-parchment-600">Round {round}</p>
          )}
        </div>
        <button
          type="button"
          onClick={async () => {
            setReactionMessage(null);
            setEffectMessage(null);
            setError(null);
            // endTurn() increments round when inCombat — capture the new round number.
            const nextRound = inCombat ? round + 1 : undefined;
            endTurn();
            closeResolution();
            // Log the new round beginning (round 1 is logged by combatStarted).
            if (inCombat && nextRound !== undefined && nextRound >= 2) {
              try {
                await advanceCombatRound(character.id, sessionId, nextRound);
                onLogChanged();
              } catch (e) {
                console.error("combat log failed (advanceCombatRound)", e);
              }
            }
          }}
          className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100"
        >
          End Turn
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── Action ──────────────────────────────────────────────────────── */}
        <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlotPip filled={actionsRemaining > 0 || attack !== null} />
              <span className="text-sm font-semibold text-parchment-800">Action</span>
              {actionsRemaining > 0 && (
                <span className="text-xs text-parchment-600">
                  {actionsRemaining} available
                </span>
              )}
              {actionsRemaining === 0 && attack === null && (
                <span className="text-xs text-parchment-600 italic">used</span>
              )}
            </div>
            {actionsRemaining > 0 && (
              <button
                type="button"
                onClick={() => setShowActionMenu((v) => !v)}
                className="text-xs font-medium text-garnet-700 hover:underline"
              >
                {showActionMenu ? "Hide" : "Use Action ▾"}
              </button>
            )}
          </div>

          {attack !== null && (
            <AttackCounter total={attack.total} used={attack.used} label="Attacks" />
          )}

          {showActionMenu && actionsRemaining > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* Attack — special path through enterAttackMode. */}
              <QuickBtn tone="garnet" onClick={handleAttackAction}>
                Attack
              </QuickBtn>
              {/* Class-specific action abilities. */}
              {classActions.map((a) => (
                <QuickBtn
                  key={a.key}
                  tone={a.enabled ? "arcane" : "neutral"}
                  disabled={!a.enabled || busy}
                  onClick={() => handleActionClick(a.key, "action")}
                  title={a.disabledReason}
                >
                  {a.name}
                </QuickBtn>
              ))}
              {/* Universal actions (excluding Attack which is above). */}
              {UNIVERSAL_ACTIONS.filter(
                (u) =>
                  u.cost === "action" &&
                  u.key !== "attack" &&
                  !classActions.some((c) => c.key === u.key),
              ).map((u) => (
                <QuickBtn
                  key={u.key}
                  onClick={() => handleActionClick(u.key, "action")}
                  title={u.description}
                >
                  {u.label}
                </QuickBtn>
              ))}
            </div>
          )}
        </div>

        {/* ── Bonus Action ─────────────────────────────────────────────────── */}
        <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlotPip filled={!bonusActionUsed && bonusAttack === null} />
              <span className="text-sm font-semibold text-parchment-800">Bonus Action</span>
              {bonusActionUsed && bonusAttack === null && (
                <span className="text-xs text-parchment-600 italic">used</span>
              )}
            </div>
            {!bonusActionUsed && (
              <button
                type="button"
                onClick={() => setShowBonusMenu((v) => !v)}
                className="text-xs font-medium text-garnet-700 hover:underline"
              >
                {showBonusMenu ? "Hide" : "Use Bonus ▾"}
              </button>
            )}
          </div>

          {bonusAttack !== null && (
            <AttackCounter
              total={bonusAttack.total}
              used={bonusAttack.used}
              label="Off-hand attack"
            />
          )}

          {showBonusMenu && !bonusActionUsed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {twfAvailable && (
                <QuickBtn tone="garnet" onClick={handleTwfAction}>
                  Off-hand Attack (TWF)
                </QuickBtn>
              )}
              {classBonusActions.map((a) => (
                <QuickBtn
                  key={a.key}
                  tone={a.enabled ? "arcane" : "neutral"}
                  disabled={!a.enabled || busy}
                  onClick={() => handleActionClick(a.key, "bonusAction")}
                  title={a.disabledReason}
                >
                  {a.name}
                </QuickBtn>
              ))}
              <QuickBtn
                onClick={() => {
                  consumeBonusAction();
                  setShowBonusMenu(false);
                }}
              >
                Other Bonus Action
              </QuickBtn>
            </div>
          )}
        </div>

        {/* ── Reaction ─────────────────────────────────────────────────────── */}
        <ReactionSlot
          reactionUsed={reactionUsed}
          showReactionMenu={showReactionMenu}
          setShowReactionMenu={setShowReactionMenu}
          classReactions={classReactions}
          reactionManeuvers={reactionManeuvers}
          superiorityRemaining={superiorityRemaining}
          dieLabel={dieLabel}
          dieBusy={dieBusy}
          busy={busy}
          reactionMessage={reactionMessage}
          error={error}
          handleActionClick={handleActionClick}
          handleReactionManeuver={handleReactionManeuver}
        />

        {/* ── Action Surge (Fighter) ─────────────────────────────────────── */}
        {actionSurgeAvailable && (
          <button
            type="button"
            disabled={busy}
            onClick={handleActionSurge}
            className="flex items-center justify-center gap-1.5 rounded-control border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm transition-colors hover:bg-gold-100 disabled:opacity-50"
          >
            <span>⚡</span>
            <span>Action Surge</span>
            {actionSurgePool && actionSurgePool.remaining > 1 && (
              <span className="text-gold-800">({actionSurgePool.remaining} left)</span>
            )}
          </button>
        )}

        {/* ── Inline tool area ──────────────────────────────────────────────── */}
        {activeResolution?.resolver.kind === "attack-picker" && (
          <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
              Select Attack
            </p>
            <InlineAttackPicker
              character={character}
              turnState={turnState}
              sessionId={sessionId}
              onClose={() => {
                finishAttack();
                closeResolution();
              }}
              onCancel={() => {
                cancelAttack();
                closeResolution();
                setShowActionMenu(true);
              }}
              onUpdate={onUpdate}
              onLogChanged={onLogChanged}
            />
          </div>
        )}

        {activeResolution?.resolver.kind === "item-picker" && (
          <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
              Use Item
            </p>
            <InlineItemPicker
              character={character}
              onUpdate={onUpdate}
              onClose={closeResolution}
            />
          </div>
        )}

        {activeResolution?.resolver.kind === "heal-input" && (
          <LayOnHandsInput
            character={character}
            onSend={send}
            onClose={closeResolution}
          />
        )}

        {activeResolution?.resolver.kind === "spell-picker" && character.spellcasting && (() => {
          const spellSlot = activeResolution.resolver.slot as "action" | "bonusAction" | "reaction";
          const slotAvailable =
            spellSlot === "action" ? actionsRemaining > 0
            : spellSlot === "bonusAction" ? !bonusActionUsed
            : !reactionUsed;
          const onCommitSlot = (spellLevel: number) => {
            if (spellSlot === "action") commitActionSpell(spellLevel);
            else if (spellSlot === "bonusAction") commitBonusActionSpell(spellLevel);
            else commitReactionSpell();
          };
          return (
            <div className="rounded-card border border-arcane-200 bg-arcane-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
                {spellSlot === "bonusAction"
                  ? "Bonus-Action Spell"
                  : spellSlot === "reaction"
                    ? "Reaction Spell"
                    : "Cast a Spell"}
              </p>
              <InlineSpellPicker
                character={character}
                sessionId={sessionId}
                onUpdate={onUpdate}
                onClose={closeResolution}
                onLogChanged={onLogChanged}
                slot={spellSlot}
                slotAvailable={slotAvailable}
                onCommitSlot={onCommitSlot}
                spellCastThisTurn={spellCastThisTurn}
                castingTimeFilter={
                  spellSlot === "bonusAction"
                    ? "1 bonus action"
                    : spellSlot === "reaction"
                      ? "1 reaction"
                      : "1 action"
                }
              />
            </div>
          );
        })()}

        {/* ── Effect maneuvers (no slot consumed) — e.g. Evasive Footwork ─────── */}
        {effectManeuvers.length > 0 && superiorityRemaining > 0 && (
          <div className="rounded-card border border-gold-200 bg-gold-50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gold-800">
              Maneuvers ({dieLabel}, {superiorityRemaining} left)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {effectManeuvers.map((m) => (
                <QuickBtn
                  key={m.id}
                  tone="gold"
                  disabled={dieBusy}
                  onClick={() => handleEffectManeuver(m.name)}
                  title={`Spend ${dieLabel} — ${m.name}`}
                >
                  {m.name} ({dieLabel})
                </QuickBtn>
              ))}
            </div>
          </div>
        )}

        {/* General error display (covers send() failures: Action Surge, Second Wind, etc.) */}
        {error && (
          <p className="text-xs font-semibold text-garnet-700">{error}</p>
        )}

        {/* Info strip for effect maneuvers (turn-scoped: Evasive Footwork, etc.) */}
        {effectMessage && (
          <p className="rounded-control border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800">
            {effectMessage}
          </p>
        )}

        {/* Note about movement */}
        <p className="text-[11px] text-parchment-600 italic">
          ⚑ Movement is not tracked here. Speed / difficult-terrain tracking is a future feature.
        </p>
      </div>
    </Card>
  );
}
