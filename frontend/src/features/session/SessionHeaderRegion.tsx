/**
 * SessionHeaderRegion — the SessionPage header, with the #746 mobile turn shell.
 *
 * During the player's active turn on a mobile viewport (`< md`) it renders the
 * slim CompactTurnHeader; otherwise (and always at `md`+) the full SessionTopBar.
 * Pure CSS `md:` toggles gated on `isActiveTurn` — no JS breakpoint hook.
 */

import CompactTurnHeader from "@/features/session/CompactTurnHeader";
import SessionTopBar from "@/features/session/SessionTopBar";
import type { Character, Session } from "@/types/character";

interface SessionHeaderRegionProps {
  character: Character;
  session: Session;
  /** turnState.phase === "active" — the player's active turn. */
  isActiveTurn: boolean;
  /** turnState.round — surfaced in the compact header's Round chip. */
  round: number;
  leavePending: boolean;
  endPending: boolean;
  leaveError: string | null;
  onCapture: () => void;
  onLeave: () => void;
  onEndClick: () => void;
}

export default function SessionHeaderRegion({
  character,
  session,
  isActiveTurn,
  round,
  leavePending,
  endPending,
  leaveError,
  onCapture,
  onLeave,
  onEndClick,
}: SessionHeaderRegionProps) {
  return (
    <>
      {/* Full top bar — hidden on mobile only during the active turn. */}
      <div className={isActiveTurn ? "hidden md:block" : undefined}>
        <SessionTopBar
          character={character}
          session={session}
          leavePending={leavePending}
          endPending={endPending}
          leaveError={leaveError}
          onCapture={onCapture}
          onLeave={onLeave}
          onEndClick={onEndClick}
        />
      </div>

      {/* Compact turn header — mobile only, active turn only. */}
      {isActiveTurn && (
        <div className="md:hidden">
          <CompactTurnHeader
            character={character}
            round={round}
            leaveError={leaveError}
            onCapture={onCapture}
            onLeave={onLeave}
            onEndClick={onEndClick}
          />
        </div>
      )}
    </>
  );
}
