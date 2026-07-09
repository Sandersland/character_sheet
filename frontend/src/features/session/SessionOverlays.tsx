/**
 * SessionOverlays — the SessionPage's overlay layer: the End-Session prompt, the
 * post-session recap modal, and the quick-capture palette. Each is gated by the
 * page's open-state and renders nothing when closed.
 */

import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import EndSessionPrompt from "@/features/session/EndSessionPrompt";
import CapturePalette from "@/features/journal/CapturePalette";
import type { Character, Session } from "@/types/character";

interface SessionOverlaysProps {
  character: Character;
  session: Session;
  showEndPrompt: boolean;
  endedSession: Session | null;
  endPending: boolean;
  endError: string | null;
  captureOpen: boolean;
  onConfirmEnd: (xpAmount: number) => void;
  onCancelEnd: () => void;
  onRecapClose: () => void;
  onCaptureClose: () => void;
  onUpdate: (c: Character) => void;
}

export default function SessionOverlays({
  character,
  session,
  showEndPrompt,
  endedSession,
  endPending,
  endError,
  captureOpen,
  onConfirmEnd,
  onCancelEnd,
  onRecapClose,
  onCaptureClose,
  onUpdate,
}: SessionOverlaysProps) {
  return (
    <>
      {showEndPrompt && (
        <EndSessionPrompt
          busy={endPending}
          error={endError}
          onConfirm={onConfirmEnd}
          onCancel={onCancelEnd}
        />
      )}

      {endedSession && (
        <SessionSummaryModal
          characterId={character.id}
          session={endedSession}
          onClose={onRecapClose}
          onCharacterUpdate={onUpdate}
        />
      )}

      {captureOpen && (
        <CapturePalette
          character={character}
          sessionId={session.id}
          onClose={onCaptureClose}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
