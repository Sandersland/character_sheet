/**
 * TurnHub — turn-economy orchestrator for the SessionPage. The primary turn
 * panel. Thin orchestrator: destructures turnState, delegates all dispatch to
 * useTurnActions, and renders the header + slots + surge + inline-tool area +
 * effect strip + messages.
 *
 * Gating:
 *   - Idle phase: only "Start Turn" prompt + the Reaction slot (reactions
 *     fire on other creatures' turns, so they stay available when idle).
 *   - Active phase: all three slots with their menus and inline tools.
 *
 * ⚑ Movement tracking is intentionally excluded (flagged for a future phase).
 */

import Card from "@/components/ui/Card";
import { Zap } from "@/components/ui/icons";
import { useTurnActions } from "@/features/session/useTurnActions";
import ActionSlot from "@/features/session/ActionSlot";
import BonusActionSlot from "@/features/session/BonusActionSlot";
import ReactionSlot from "@/features/session/ReactionSlot";
import EffectManeuverStrip from "@/features/session/EffectManeuverStrip";
import LayOnHandsInput from "@/features/session/LayOnHandsInput";
import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import InlineItemPicker from "@/features/session/InlineItemPicker";
import InlineSpellPicker from "@/features/session/InlineSpellPicker";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

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
    cancelAttack,
    finishAttack,
    consumeBonusAction,
    commitActionSpell,
    commitBonusActionSpell,
    commitReactionSpell,
  } = turnState;

  const {
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
  } = useTurnActions({ character, sessionId, turnState, onUpdate, onLogChanged });

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
                onClick={handleStartTurn}
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
          onClick={handleEndTurn}
          className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100"
        >
          End Turn
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── Action ──────────────────────────────────────────────────────── */}
        <ActionSlot
          actionsRemaining={actionsRemaining}
          attack={attack}
          showActionMenu={showActionMenu}
          setShowActionMenu={setShowActionMenu}
          classActions={classActions}
          busy={busy}
          handleAttackAction={handleAttackAction}
          handleActionClick={handleActionClick}
        />

        {/* ── Bonus Action ─────────────────────────────────────────────────── */}
        <BonusActionSlot
          bonusActionUsed={bonusActionUsed}
          bonusAttack={bonusAttack}
          showBonusMenu={showBonusMenu}
          setShowBonusMenu={setShowBonusMenu}
          twfAvailable={twfAvailable}
          classBonusActions={classBonusActions}
          busy={busy}
          handleTwfAction={handleTwfAction}
          handleActionClick={handleActionClick}
          consumeBonusAction={consumeBonusAction}
        />

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
            <Zap aria-hidden="true" className="h-3.5 w-3.5" />
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
        <EffectManeuverStrip
          effectManeuvers={effectManeuvers}
          superiorityRemaining={superiorityRemaining}
          dieLabel={dieLabel}
          dieBusy={dieBusy}
          handleEffectManeuver={handleEffectManeuver}
        />

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

        {/* Durable-buff end reminders (e.g. Rage) — when/why the buff will end. */}
        {durableReminders.map((r) => (
          <p
            key={r.key}
            className="rounded-control border border-garnet-200 bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-800"
          >
            {r.reminder}
          </p>
        ))}

        {/* Note about movement */}
        <p className="text-[11px] text-parchment-600 italic">
          ⚑ Movement is not tracked here. Speed / difficult-terrain tracking is a future feature.
        </p>
      </div>
    </Card>
  );
}
