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
import { ChevronRight, ScrollText, Zap } from "@/components/ui/icons";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { useTurnActions } from "@/features/session/useTurnActions";
import ActionSlot from "@/features/session/ActionSlot";
import BonusActionSlot from "@/features/session/BonusActionSlot";
import ReactionSlot from "@/features/session/ReactionSlot";
import EffectManeuverStrip from "@/features/session/EffectManeuverStrip";
import LoadoutRefundStrip from "@/features/session/LoadoutRefundStrip";
import TurnConcentrationBanner from "@/features/session/TurnConcentrationBanner";
import TurnDeathSaves from "@/features/session/TurnDeathSaves";
import CastTallyBanner from "@/features/session/CastTallyBanner";
import TurnSummaryBanner from "@/features/session/TurnSummaryBanner";
import { useTallyResolve } from "@/features/session/useTallyResolve";
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
  /**
   * Whether the hub's overlay pickers (BottomSheet, portaled to document.body)
   * may render (#960). Defaults true. In the sheet workspace the live-Combat
   * panel stays mounted while you swipe to another tab; passing `false` unmounts
   * an open picker so it can't float over Overview, while the picker STATE
   * (activeResolution) survives so it reopens on return.
   */
  overlaysActive?: boolean;
  /** Opens the session log (mobile only, #1028). The turn bar shows a log icon
   *  only when a host wires this; the `/session`-less sheet Combat tab does. */
  onOpenLog?: () => void;
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
          disabled={busy}
          onClick={onEndTurn}
          className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
        >
          End turn
        </button>
      </div>
    </div>
  );
}

// Mobile turn bar (#1028): replaces the "Your turn" card header + the Turn/Log
// segmented control. Serif title + Round · Move {speed} ft, a pinned End turn at
// a fixed spot, a log icon (when a host wires onOpenLog), and Undo once history
// exists. Full-bleed; the desktop card keeps TurnHubHeader.
function MobileTurnBar({
  round,
  speed,
  busy,
  canUndo,
  onUndo,
  onEndTurn,
  onOpenLog,
}: {
  round: number;
  speed: number | undefined;
  busy: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onEndTurn: () => void;
  onOpenLog?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-parchment-200 bg-parchment-50 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold leading-tight text-garnet-700">Your turn</p>
        <p className="mt-0.5 text-xs font-medium tabular-nums text-parchment-600">
          Round {round}
          {typeof speed === "number" && <> · Move {speed} ft</>}
        </p>
      </div>
      {canUndo && (
        <button
          type="button"
          disabled={busy}
          onClick={onUndo}
          className="shrink-0 rounded-control px-2 py-1.5 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-50 disabled:opacity-50"
        >
          <span aria-hidden="true">↩ </span>Undo
        </button>
      )}
      {onOpenLog && (
        <button
          type="button"
          onClick={onOpenLog}
          aria-label="Open session log"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-parchment-500 transition-colors hover:bg-parchment-100"
        >
          <ScrollText aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onEndTurn}
        className="shrink-0 rounded-control border border-garnet-300 bg-garnet-700 px-3.5 py-2 text-xs font-semibold text-parchment-50 shadow-sm transition-colors hover:bg-garnet-800 disabled:opacity-50"
      >
        End turn
      </button>
    </div>
  );
}

// Initiative strip (#1023 Phase B–D): the turn-order scroller. Behind the
// showInitiative flag — the app doesn't model enemies/turn-order yet, so it
// renders nothing for users today. Markup kept minimal until the data exists.
function InitiativeStrip() {
  if (!showInitiative) return null;
  return (
    <div
      role="region"
      aria-label="Initiative order"
      className="flex items-center gap-2 overflow-x-auto border-b border-parchment-200 px-4 py-2"
    />
  );
}

// Action Surge (Fighter) — self-gating: renders nothing when unavailable.
// Desktop keeps the compact gold pill; mobile (#1028) is a full-bleed gold row.
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
  const isMobile = useIsBelowMd();
  if (!available) return null;
  const usesLeft = pool && pool.remaining > 1 ? `${pool.remaining} uses left` : "1 use left";
  if (isMobile) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onSurge}
        className="pressable divider-hairline flex min-h-[52px] w-full items-center gap-3 bg-gold-50 px-4 py-2.5 text-left disabled:opacity-50"
      >
        <Zap aria-hidden="true" className="h-5 w-5 shrink-0 text-gold-800" />
        <span className="flex-1 text-base font-semibold text-gold-800">Action Surge</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-gold-800/75">{usesLeft}</span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gold-800/60" />
      </button>
    );
  }
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

export default function TurnHub({ character, sessionId, turnState, onUpdate, onLogChanged, allies, overlaysActive = true, onOpenLog }: TurnHubProps) {
  const isBelowMd = useIsBelowMd();
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
    castTally,
    twfAvailable,
    consumeBonusAction,
    consumeReaction,
    clearAttackTally,
    clearCastTally,
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

  // Shared surfaces — identical on both breakpoints; only the slot rows and the
  // wrapper/header differ (TurnSlotCard self-adapts to a full-bleed mobile row).
  const deathSaves = <TurnDeathSaves character={character} onUpdate={onUpdate} />;
  const concentration = (
    <TurnConcentrationBanner character={character} onUpdate={onUpdate} onLogChanged={onLogChanged} />
  );
  const actionSlot = (
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
  );
  const bonusSlot = (
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
  );
  const reactionSlot = (
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
  );
  const actionSurge = (
    <ActionSurgeButton
      available={actionSurgeAvailable}
      pool={actionSurgePool}
      busy={busy}
      onSurge={handleActionSurge}
    />
  );
  // Overlay pickers render only when the panel is the active tab (#960): a
  // portaled BottomSheet would otherwise float over another tab while this panel
  // is mounted-but-hidden. `activeResolution` survives, so the sheet reopens.
  const resolutionSheets = overlaysActive && (
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
  );
  // Split around Action Surge so the desktop order stays byte-identical (surge sat
  // between the Turn-summary banner and the resolution sheets).
  const trailingBeforeSurge = (
    <>
      {/* Weapon-change Refund — persists until refunded or turn end (#815). */}
      <LoadoutRefundStrip loadout={loadoutSwap} />
      {/* "Turn summary" banner — attack tally once the sheet is closed; unresolved
          lines resolve inline, resolved lines offer a quiet Change (#811). */}
      {!activeResolution && (
        <TurnSummaryBanner rows={attackTally} onDismiss={clearAttackTally} resolve={tallyResolve} />
      )}
      {/* "Spells cast" tally (#1164) — the cast sheet's post-cast receipts,
          same shelf as the attack summary, once the sheet is closed. */}
      {!activeResolution && <CastTallyBanner rows={castTally} onDismiss={clearCastTally} />}
    </>
  );
  const trailingAfterSurge = (
    <>
      {resolutionSheets}
      {/* Effect maneuvers (no slot consumed) — e.g. Evasive Footwork. */}
      <EffectManeuverStrip
        effectManeuvers={effectManeuvers}
        superiorityRemaining={superiorityRemaining}
        dieLabel={dieLabel}
        dieBusy={dieBusy}
        handleEffectManeuver={handleEffectManeuver}
      />
      <TurnMessages error={error} effectMessage={effectMessage} durableReminders={durableReminders} />
    </>
  );

  // Mobile (#1028): full-bleed turn bar + edge-to-edge slot rows, no card gutter.
  if (isBelowMd) {
    return (
      <div className="overflow-hidden bg-parchment-50">
        <MobileTurnBar
          round={round}
          speed={character.speed}
          busy={busy}
          canUndo={history.length > 0}
          onUndo={handleUndo}
          onEndTurn={handleEndTurn}
          onOpenLog={onOpenLog}
        />
        <InitiativeStrip />
        {/* Death saves / concentration surface above the slots when active; the
            wrapper hides itself when both render nothing (empty:hidden). */}
        <div className="flex flex-col gap-3 px-4 py-3 empty:hidden">
          {deathSaves}
          {concentration}
        </div>
        {actionSlot}
        {bonusSlot}
        {reactionSlot}
        {actionSurge}
        <div className="flex flex-col gap-3 px-4 py-3 empty:hidden">
          {trailingBeforeSurge}
          {trailingAfterSurge}
        </div>
      </div>
    );
  }

  // Desktop: the original bordered card + header, pixel-identical.
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
        {deathSaves}
        {concentration}
        {actionSlot}
        {bonusSlot}
        {reactionSlot}
        {trailingBeforeSurge}
        {actionSurge}
        {trailingAfterSurge}
      </div>
    </Card>
  );
}
