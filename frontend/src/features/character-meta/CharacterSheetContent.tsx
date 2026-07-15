import { useState } from "react";

import RollResultToast from "@/features/dice/RollResultToast";
import RollModeToggle from "@/features/dice/RollModeToggle";
import { RollProvider } from "@/features/dice/RollContext";
import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import CharacterSheetBody from "@/features/character-meta/CharacterSheetBody";
import SheetBottomNav from "@/features/character-meta/SheetBottomNav";
import CharacterSheetModals from "@/features/character-meta/CharacterSheetModals";
import { useSheetTabs } from "@/features/character-meta/useSheetTabs";
import { useCaptureDock } from "@/hooks/useCaptureDock";
import { useSessionButton } from "@/features/session/useSessionButton";
import type { Character, ReferenceData } from "@/types/character";

interface CharacterSheetContentProps {
  id: string | undefined;
  character: Character;
  reference: ReferenceData | null;
  onUpdate: (c: Character) => void;
}

/**
 * The loaded-sheet view: banner + tab panels + the roll/modal chrome. Split out
 * from CharacterSheetPage so the page holds only the load/error/guard states and
 * this owns the per-character interaction state (tabs, modals, capture dock,
 * session button).
 */
export default function CharacterSheetContent({
  id,
  character,
  reference,
  onUpdate,
}: CharacterSheetContentProps) {
  const { tabs, activeTab, onTabChange } = useSheetTabs(character);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  // Cmd/Ctrl+J toggles the quick-capture dock from anywhere on the sheet.
  const { captureOpen, openCapture, closeCapture } = useCaptureDock();
  const session = useSessionButton(id, character);

  return (
    <RollProvider
      characterId={character.id}
      sessionId={session.inActiveSession ? session.activeSessionId : null}
      rollModifiers={character.rollModifiers}
    >
      <div className="min-h-screen bg-parchment-100 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0">
        <CharacterSheetHeader
          character={character}
          session={session}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onOpenCapture={openCapture}
          onOpenSessions={() => setSessionsOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onOpenDelete={() => setConfirmDeleteOpen(true)}
        />

        <CharacterSheetModals
          character={character}
          onUpdate={onUpdate}
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

        <CharacterSheetBody
          character={character}
          reference={reference}
          onUpdate={onUpdate}
          activeTab={activeTab}
        />
        <RollModeToggle />
        <RollResultToast />
        <SheetBottomNav tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </RollProvider>
  );
}
