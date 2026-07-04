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
import { useGlobalKeyboard } from "@/hooks/useGlobalKeyboard";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useSessionButton } from "@/features/session/useSessionButton";

export default function CharacterSheetPage() {
  const { id } = useParams();
  const { character, error, setCharacter } = useCharacter(id);
  const { reference } = useReferenceData();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const showSpinner = useDelayedFlag(character === undefined && !error);
  const session = useSessionButton(id, character);

  // Cmd/Ctrl+J opens the quick-capture palette from anywhere on the sheet.
  useGlobalKeyboard(() => setCaptureOpen(true));

  if (error) return <CharacterLoadError variant="error" />;

  if (character === undefined) {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (character === null) return <CharacterLoadError variant="not-found" characterId={id} />;

  return (
    <RollProvider>
      <div className="min-h-screen bg-parchment-100">
        <CharacterSheetHeader
          character={character}
          session={session}
          onOpenCapture={() => setCaptureOpen(true)}
          onOpenSessions={() => setSessionsOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onOpenDelete={() => setConfirmDeleteOpen(true)}
        />

        <CharacterSheetModals
          character={character}
          onUpdate={setCharacter}
          captureSessionId={session.activeSessionId}
          deleteOpen={confirmDeleteOpen}
          activityOpen={activityOpen}
          sessionsOpen={sessionsOpen}
          captureOpen={captureOpen}
          onCloseDelete={() => setConfirmDeleteOpen(false)}
          onCloseActivity={() => setActivityOpen(false)}
          onCloseSessions={() => setSessionsOpen(false)}
          onCloseCapture={() => setCaptureOpen(false)}
        />

        <CharacterSheetBody
          character={character}
          reference={reference}
          onUpdate={setCharacter}
          journalSessionId={session.inActiveSession ? session.activeSessionId : undefined}
        />
        <RollModeToggle />
        <RollResultToast />
      </div>
    </RollProvider>
  );
}
