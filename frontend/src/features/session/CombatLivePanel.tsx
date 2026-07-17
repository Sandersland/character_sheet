/**
 * The live turn tracker, re-homed into the sheet workspace (#960): when a
 * session is live AND this character is in it, the Combat tab renders THIS
 * instead of the static combat panel. Same turn machinery as the old `/session`
 * page — start combat → your turn → action economy → end turn — just here, so
 * "swipe Combat → Overview → roll → swipe back" works.
 *
 * Consumes the #959 workspace providers: turn state via `useTurnStateContext()`
 * (never its own `useTurnState` — a second instance would diverge), live session
 * via `useLiveSession()`, and the workspace `RollProvider` (already threaded
 * with the live `sessionId`). It owns only UI state (the open picker) + the
 * End/Leave lifecycle; the turn economy lives in the provider, so it survives a
 * swipe away (this panel stays mounted, hidden) and even a remount.
 *
 * `active` = the Combat tab is the visible tab. Overlay pickers (BottomSheet,
 * portaled to document.body) render ONLY while active, so a hidden panel's open
 * sheet never floats over Overview; the End prompt is likewise active-gated.
 */

import LiveTurnBody from "@/features/session/LiveTurnBody";
import SessionHeaderRegion from "@/features/session/SessionHeaderRegion";
import EndSessionPrompt from "@/features/session/EndSessionPrompt";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useCombatLifecycle } from "@/features/session/useCombatLifecycle";
import type { Character, Session } from "@/types/character";

interface CombatLivePanelProps {
  character: Character;
  /** The live joined session (participants included) — parent-guaranteed non-null. */
  session: Session;
  onUpdate: (c: Character) => void;
  /** The Combat tab is the visible tab — gates overlay/prompt render. */
  active: boolean;
  /** Open the workspace quick-capture dock (the header's Note action). */
  onCapture: () => void;
}

export default function CombatLivePanel({
  character,
  session,
  onUpdate,
  active,
  onCapture,
}: CombatLivePanelProps) {
  const turnState = useTurnStateContext();
  const live = useLiveSession();
  const life = useCombatLifecycle({ character, session, onUpdate, live });

  // The panel is mounted only while live+joined, so turnState is non-null in
  // practice; guard the render (never the hooks above) for safety.
  if (!turnState) return null;

  const isActiveTurn = turnState.phase === "active";

  return (
    <div className="bg-parchment-100">
      <SessionHeaderRegion
        character={character}
        session={session}
        isActiveTurn={isActiveTurn}
        round={turnState.round}
        leavePending={life.leavePending}
        endPending={life.endPending}
        leaveError={life.leaveError}
        onCapture={onCapture}
        onLeave={life.handleLeave}
        onEndClick={life.openEndPrompt}
      />

      {/* A section, not a <main> — this renders inside CharacterSheetBody's
          <main> landmark (the sheet's Combat tab), so a nested main is invalid. */}
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 pt-6">
        <LiveTurnBody
          character={character}
          session={session}
          turnState={turnState}
          onUpdate={life.handleCharacterUpdate}
          onLogChanged={live.bumpLog}
          overlaysActive={active}
        />
      </div>

      {/* The End-Session prompt — gated on the tab being visible so a hidden
          panel never trap-focuses a dialog over Overview. The recap overlay
          lives at the workspace level (it must outlive this panel unmounting). */}
      {active && life.endPromptOpen && (
        <EndSessionPrompt
          busy={life.endPending}
          error={life.endError}
          onConfirm={life.handleConfirmEnd}
          onCancel={life.closeEndPrompt}
        />
      )}
    </div>
  );
}
