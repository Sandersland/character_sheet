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
import LoadoutRefundStrip from "@/features/session/LoadoutRefundStrip";
import TurnConcentrationBanner from "@/features/session/TurnConcentrationBanner";
import TurnDeathSaves from "@/features/session/TurnDeathSaves";
import TurnSummaryBanner from "@/features/session/TurnSummaryBanner";
import { useTallyResolve } from "@/features/session/useTallyResolve";
import TurnResolutionSheets from "@/features/session/TurnResolutionSheets";
import { showMovement } from "@/features/session/turnFlags";
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
  /**
   * Whether the hub's overlay pickers (BottomSheet, portaled to document.body)
   * may render (#960). Defaults true. In the sheet workspace the live-Combat
   * panel stays mounted while you swipe to another tab; passing `false` unmounts
   * an open picker so it can't float over Overview, while the picker STATE
   * (activeResolution) survives so it reopens on return.
   */
  overlaysActive?: boolean;
}

// Idle-phase presentation: the Start-Combat gate (not in combat) or the
// between-turns card (round header, death saves, concentration, Reaction —
// which fires on other creatures' turns — and Start-my-turn). Takes the whole
// hook bags rather than ~18 loose props; TurnHub stays the orchestrator.
function TurnHubIdle({
  character,
  onUpdate,
  onLogChanged,
  turnState,
  turn,
}: {
  character: Character;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
  turnState: TurnStateView;
  turn: ReturnType<typeof useTurnActions>;
}) {
  const { inCombat, round, reactionUsed, consumeReaction } = turnState;
  const {
    busy, error, reactionMessage,
    showReactionMenu, setShowReactionMenu,
    dieLabel, dieBusy, superiorityRemaining, classReactions, reactionManeuvers,
    reactionSheetModel,
    handleActionClick, handleReactionManeuver,
    handleStartCombat, handleEndCombat, handleStartTurn,
  } = turn;

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

  // In combat but between turns — round indicator, Start Turn, End Combat, Reaction.
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

// Active-turn header: title, round chip, Undo (only once history exists), End turn.
function TurnHubHeader({
  inCombat,
  round,
  busy,
  canUndo,
  onUndo,
  onEndTurn,
}: {
  inCombat: boolean;
  round: number;
  busy: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onEndTurn: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <p className="font-display text-lg font-semibold text-garnet-700">Your turn</p>
        {inCombat && <p className="mt-0.5 text-xs text-parchment-600">Round {round}</p>}
      </div>
      <div className="flex items-center gap-2">
        {canUndo && (
          <button
            type="button"
            disabled={busy}
            onClick={onUndo}
            className="rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-100 disabled:opacity-50"
          >
            <span aria-hidden="true">↩ </span>Undo
          </button>
        )}
        <button
          type="button"
          onClick={onEndTurn}
          className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100"
        >
          End turn
        </button>
      </div>
    </div>
  );
}

// Action Surge (Fighter) — self-gating: renders nothing when unavailable.
function ActionSurgeButton({
  available,
  pool,
  busy,
  onSurge,
}: {
  available: boolean;
  pool: { remaining: number } | null | undefined;
  busy: boolean;
  onSurge: () => void;
}) {
  if (!available) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onSurge}
      className="flex items-center justify-center gap-1.5 rounded-control border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm transition-colors hover:bg-gold-100 disabled:opacity-50"
    >
      <Zap aria-hidden="true" className="h-3.5 w-3.5" />
      <span>Action Surge</span>
      {pool && pool.remaining > 1 && <span className="text-gold-800">({pool.remaining} left)</span>}
    </button>
  );
}

// Trailing message strips: send() errors, effect-maneuver info, durable-buff
// end reminders (e.g. Rage), and the movement-not-tracked note.
function TurnMessages({
  error,
  effectMessage,
  durableReminders,
}: {
  error: string | null;
  effectMessage: string | null;
  durableReminders: { key: string; reminder: string }[];
}) {
  return (
    <>
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
      {effectMessage && (
        <p className="rounded-control border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800">
          {effectMessage}
        </p>
      )}
      {durableReminders.map((r) => (
        <p
          key={r.key}
          className="rounded-control border border-garnet-200 bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-800"
        >
          {r.reminder}
        </p>
      ))}
      {showMovement && (
        <p className="text-[11px] text-parchment-600 italic">
          ⚑ Movement is not tracked here. Speed / difficult-terrain tracking is a future feature.
        </p>
      )}
    </>
  );
}

export default function TurnHub({ character, sessionId, turnState, onUpdate, onLogChanged, allies, overlaysActive = true }: TurnHubProps) {
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
    clearAttackTally,
    history,
  } = turnState;

  const turn = useTurnActions({ character, sessionId, turnState, onUpdate, onLogChanged });
  // Grouped for readability; also keeps this destructure from cloning
  // useTurnActions' flat return block (a benign hook-bag mirror).
  const { busy, error, reactionMessage, effectMessage, send, handleUndo } = turn;
  const {
    showActionMenu, setShowActionMenu, showBonusMenu, setShowBonusMenu,
    showReactionMenu, setShowReactionMenu, activeResolution, closeResolution,
    loadoutSwap,
  } = turn;
  const {
    dieLabel, dieBusy, superiorityRemaining, classActions, classBonusActions,
    classReactions, durableReminders, reactionManeuvers, effectManeuvers,
    actionSurgePool, actionSurgeAvailable,
    actionSheetModel, bonusSheetModel, reactionSheetModel,
  } = turn;
  const {
    handleActionClick, handleAttackAction, handleResumeAttack, handleTwfAction, handleActionSurge,
    handleEndTurn, handleReactionManeuver, handleEffectManeuver, handleBonusSpellCast,
  } = turn;

  // Inline banner resolve (#811): verdict writes + on-line damage rolls for
  // skipped attacks, shared-shaped with the in-sheet strip's rule.
  const tallyResolve = useTallyResolve({
    character,
    sessionId,
    setTallyVerdict: turnState.setTallyVerdict,
    setTallyDamageAt: turnState.setTallyDamageAt,
    onLogChanged,
  });

  // ── Idle state ─────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <TurnHubIdle
        character={character}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
        turnState={turnState}
        turn={turn}
      />
    );
  }

  // ── Active state ────────────────────────────────────────────────────────────

  return (
    <Card className="p-4">
      <TurnHubHeader
        inCombat={inCombat}
        round={round}
        busy={busy}
        canUndo={history.length > 0}
        onUndo={handleUndo}
        onEndTurn={handleEndTurn}
      />

      <div className="flex flex-col gap-3">
        {/* Death saves surface on your own turn too — the primary moment a
            downed player rolls a save (#736/#744). */}
        <TurnDeathSaves character={character} onUpdate={onUpdate} />

        <TurnConcentrationBanner
          character={character}
          onUpdate={onUpdate}
          onLogChanged={onLogChanged}
        />

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

        {/* ── Weapon-change Refund — persists until refunded or turn end (#815) ── */}
        <LoadoutRefundStrip loadout={loadoutSwap} />

        {/* ── "Turn summary" banner — attack tally once the sheet is closed;
            unresolved lines resolve inline, resolved lines offer quiet Change (#811) ── */}
        {!activeResolution && (
          <TurnSummaryBanner rows={attackTally} onDismiss={clearAttackTally} resolve={tallyResolve} />
        )}

        {/* ── Action Surge (Fighter) ─────────────────────────────────────── */}
        <ActionSurgeButton
          available={actionSurgeAvailable}
          pool={actionSurgePool}
          busy={busy}
          onSurge={handleActionSurge}
        />

        {/* ── Resolution sheets ─────────────────────────────────────────────── */}
        {/* Overlay pickers render only when the panel is the active tab (#960):
            a portaled BottomSheet would otherwise float over another tab while
            this panel is mounted-but-hidden. `activeResolution` survives, so the
            sheet reopens on return. */}
        {overlaysActive && (
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
            loadoutSwap={loadoutSwap}
          />
        )}

        {/* ── Effect maneuvers (no slot consumed) — e.g. Evasive Footwork ─────── */}
        <EffectManeuverStrip
          effectManeuvers={effectManeuvers}
          superiorityRemaining={superiorityRemaining}
          dieLabel={dieLabel}
          dieBusy={dieBusy}
          handleEffectManeuver={handleEffectManeuver}
        />

        <TurnMessages error={error} effectMessage={effectMessage} durableReminders={durableReminders} />
      </div>
    </Card>
  );
}
