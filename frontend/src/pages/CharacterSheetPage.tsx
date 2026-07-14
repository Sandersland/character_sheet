import { useState } from "react";
import { useParams } from "react-router-dom";

import RollResultToast from "@/features/dice/RollResultToast";
import RollModeToggle from "@/features/dice/RollModeToggle";
import { RollProvider } from "@/features/dice/RollContext";
import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import CharacterSheetBody from "@/features/character-meta/CharacterSheetBody";
import CharacterSheetModals from "@/features/character-meta/CharacterSheetModals";
import CharacterLoadError from "@/features/character-meta/CharacterLoadError";
import Spinner from "@/components/ui/Spinner";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useCaptureDock } from "@/hooks/useCaptureDock";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useSessionButton } from "@/features/session/useSessionButton";

export default function CharacterSheetPage() {
  const { id } = useParams();
  const { character, error, setCharacter } = useCharacter(id);
  const { reference } = useReferenceData();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  // Cmd/Ctrl+J toggles the quick-capture dock from anywhere on the sheet.
  const { captureOpen, openCapture, closeCapture } = useCaptureDock();
  const showSpinner = useDelayedFlag(character === undefined && !error);
  const session = useSessionButton(id, character);

  if (error) return <CharacterLoadError variant="error" />;

  if (character === undefined) {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (character === null) return <CharacterLoadError variant="not-found" characterId={id} />;

  return (
    <RollProvider
      characterId={character.id}
      sessionId={session.inActiveSession ? session.activeSessionId : null}
      rollModifiers={character.rollModifiers}
    >
      <div className="min-h-screen bg-parchment-100 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <CharacterSheetHeader
          character={character}
          session={session}
          onOpenCapture={openCapture}
          onOpenSessions={() => setSessionsOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onOpenDelete={() => setConfirmDeleteOpen(true)}
        />

        <CharacterSheetModals
          character={character}
          onUpdate={setCharacter}
          captureSessionId={session.activeSessionId}
          captureSession={session.inActiveSession ? session.activeSession : null}
          deleteOpen={confirmDeleteOpen}
          activityOpen={activityOpen}
          sessionsOpen={sessionsOpen}
          captureOpen={captureOpen}
          onCloseDelete={() => setConfirmDeleteOpen(false)}
          onCloseActivity={() => setActivityOpen(false)}
          onCloseSessions={() => setSessionsOpen(false)}
          onCloseCapture={closeCapture}
        />

        <CharacterSheetBody character={character} reference={reference} onUpdate={setCharacter} />
        <RollModeToggle />
        <RollResultToast />
      </div>
    </RollProvider>
  );
}
