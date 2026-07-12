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
import LoadoutSwapRow from "@/features/session/LoadoutSwapRow";
import InitiativeRail from "@/features/session/InitiativeRail";
import TurnConcentrationBanner from "@/features/session/TurnConcentrationBanner";
import TurnDeathSaves from "@/features/session/TurnDeathSaves";
import TurnDmBanner from "@/features/session/TurnDmBanner";
import TurnResolutionSheets from "@/features/session/TurnResolutionSheets";
import { showInitiative, showMovement } from "@/features/session/turnFlags";
import type { AllyOption } from "@/lib/spellMeta";
import type { TurnStateView } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

interface TurnHubProps {
  character: Character;
  sessionId: string;
  turnState: TurnStateView;
  onUpdate: (c: Character) => void;
  /** Called after a combat log event so the Log tab refreshes. */
  onLogChanged: () => void;
  /** Opted-in party members a healing cast can target on their sheet (#462). */
  allies: AllyOption[];
}

export default function TurnHub({ character, sessionId, turnState, onUpdate, onLogChanged, allies }: TurnHubProps) {
  const {
    inCombat,
    round,
    phase,
    actionsRemaining,
    bonusActionUsed,
    reactionUsed,
    attack,
    bonusAttack,
    attackTally,
    twfAvailable,
    consumeBonusAction,
    consumeReaction,
    history,
  } = turnState;

  const turn = useTurnActions({ character, sessionId, turnState, onUpdate, onLogChanged });
  // Grouped for readability; also keeps this destructure from cloning
  // useTurnActions' flat return block (a benign hook-bag mirror).
  const { busy, error, reactionMessage, effectMessage, send, handleUndo } = turn;
  const {
    showActionMenu, setShowActionMenu, showBonusMenu, setShowBonusMenu,
    showReactionMenu, setShowReactionMenu, activeResolution, closeResolution,
  } = turn;
  const {
    dieLabel, dieBusy, superiorityRemaining, classActions, classBonusActions,
    classReactions, durableReminders, reactionManeuvers, effectManeuvers,
    actionSurgePool, actionSurgeAvailable,
    actionSheetModel, bonusSheetModel, reactionSheetModel,
  } = turn;
  const {
    handleActionClick, handleAttackAction, handleResumeAttack, handleTwfAction, handleActionSurge,
    handleStartCombat, handleEndCombat, handleStartTurn, handleEndTurn,
    handleReactionManeuver, handleEffectManeuver, handleBonusSpellCast,
  } = turn;

  // Decorative initiative rail's "you" marker (#737).
  const youInitial = character.name?.[0]?.toUpperCase() ?? "?";

  // ── Idle state ─────────────────────────────────────────────────────────────
  if (phase === "idle") {
    // Not in combat — show only the Start Combat gate.
    if (!inCombat) {
      return (
        <Card className="p-4">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="font-display text-lg font-semibold text-parchment-900">Not in combat</p>
            <p className="max-w-xs text-xs text-parchment-600">
              Explore, talk, rest. When the DM calls for initiative, start the encounter to track
              your turn.
            </p>
            <button
              type="button"
              onClick={handleStartCombat}
              className="mt-1 w-full rounded-control border border-garnet-300 bg-garnet-700 px-4 py-2.5 text-sm font-semibold text-parchment-50 shadow-sm transition-colors hover:bg-garnet-800"
            >
              Roll initiative · Start combat
            </button>
          </div>
        </Card>
      );
    }

    // In combat but between turns — show round indicator, Start Turn, End Combat, Reaction.
    return (
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-base font-semibold text-parchment-900">
              Combat — Round {round}
            </p>
            <button
              type="button"
              onClick={handleEndCombat}
              className="shrink-0 rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100"
            >
              End combat
            </button>
          </div>

          {showInitiative && (
            <InitiativeRail youInitial={youInitial} active={false} />
          )}

          <TurnDeathSaves character={character} onUpdate={onUpdate} />

          <TurnConcentrationBanner
            character={character}
            onUpdate={onUpdate}
            onLogChanged={onLogChanged}
          />

          {/* Reaction is available between turns — render it in idle mode. */}
          <ReactionSlot
            reactionUsed={reactionUsed}
            showReactionMenu={showReactionMenu}
            setShowReactionMenu={setShowReactionMenu}
            classReactions={classReactions}
            sheetModel={reactionSheetModel}
            reactionManeuvers={reactionManeuvers}
            superiorityRemaining={superiorityRemaining}
            dieLabel={dieLabel}
            dieBusy={dieBusy}
            busy={busy}
            reactionMessage={reactionMessage}
            error={error}
            handleActionClick={handleActionClick}
            handleReactionManeuver={handleReactionManeuver}
            consumeReaction={consumeReaction}
          />

          <button
            type="button"
            onClick={handleStartTurn}
            className="w-full rounded-control border border-garnet-300 bg-garnet-700 px-4 py-2.5 text-sm font-semibold text-parchment-50 shadow-sm transition-colors hover:bg-garnet-800"
          >
            Start my turn
          </button>
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
          <p className="font-display text-lg font-semibold text-garnet-700">Your turn</p>
          {inCombat && (
            <p className="mt-0.5 text-xs text-parchment-600">Round {round}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={handleUndo}
              className="rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-100 disabled:opacity-50"
            >
              <span aria-hidden="true">↩ </span>Undo
            </button>
          )}
          <button
            type="button"
            onClick={handleEndTurn}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100"
          >
            End turn
          </button>
        </div>
      </div>

      {showInitiative && (
        <div className="mb-4">
          <InitiativeRail youInitial={youInitial} active />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Death saves surface on your own turn too — the primary moment a
            downed player rolls a save (#736/#744). */}
        <TurnDeathSaves character={character} onUpdate={onUpdate} />

        <TurnConcentrationBanner
          character={character}
          onUpdate={onUpdate}
          onLogChanged={onLogChanged}
        />

        {/* ── Loadout (slot root, pre-attack) — a swap costs the Action (#733) ── */}
        <LoadoutSwapRow character={character} turnState={turnState} onUpdate={onUpdate} />

        {/* ── Action ──────────────────────────────────────────────────────── */}
        <ActionSlot
          actionsRemaining={actionsRemaining}
          attack={attack}
          showActionMenu={showActionMenu}
          setShowActionMenu={setShowActionMenu}
          classActions={classActions}
          sheetModel={actionSheetModel}
          busy={busy}
          handleAttackAction={handleAttackAction}
          handleResumeAttack={handleResumeAttack}
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
          sheetModel={bonusSheetModel}
          busy={busy}
          handleTwfAction={handleTwfAction}
          handleActionClick={handleActionClick}
          handleBonusSpellCast={handleBonusSpellCast}
          consumeBonusAction={consumeBonusAction}
        />

        {/* ── Reaction ─────────────────────────────────────────────────────── */}
        <ReactionSlot
          reactionUsed={reactionUsed}
          showReactionMenu={showReactionMenu}
          setShowReactionMenu={setShowReactionMenu}
          classReactions={classReactions}
          sheetModel={reactionSheetModel}
          reactionManeuvers={reactionManeuvers}
          superiorityRemaining={superiorityRemaining}
          dieLabel={dieLabel}
          dieBusy={dieBusy}
          busy={busy}
          reactionMessage={reactionMessage}
          error={error}
          handleActionClick={handleActionClick}
          handleReactionManeuver={handleReactionManeuver}
          consumeReaction={consumeReaction}
        />

        {/* ── "Tell your DM" banner — attack tally once the sheet is closed ── */}
        {!activeResolution && <TurnDmBanner rows={attackTally} />}

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

        {/* ── Resolution sheets ─────────────────────────────────────────────── */}
        <TurnResolutionSheets
          character={character}
          sessionId={sessionId}
          turnState={turnState}
          activeResolution={activeResolution}
          closeResolution={closeResolution}
          setShowActionMenu={setShowActionMenu}
          setShowBonusMenu={setShowBonusMenu}
          onUpdate={onUpdate}
          onLogChanged={onLogChanged}
          allies={allies}
          send={send}
        />

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

        {/* Note about movement (gated: the movement system is a future feature) */}
        {showMovement && (
          <p className="text-[11px] text-parchment-600 italic">
            ⚑ Movement is not tracked here. Speed / difficult-terrain tracking is a future feature.
          </p>
        )}
      </div>
    </Card>
  );
}
