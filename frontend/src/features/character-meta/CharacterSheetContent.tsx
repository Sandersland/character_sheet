import { useState } from "react";

import RollResultToast from "@/features/dice/RollResultToast";
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
      {/* Mobile: a 100dvh app-shell — fixed header + in-flow bottom nav with the
          panels scrolling in the middle, so iOS Safari's dynamic toolbar can't
          shift a body-scrolled fixed nav (no gap; nav always flush). Desktop
          reverts to normal min-h-screen body scroll (nav is md:hidden). */}
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-parchment-100 md:block md:h-auto md:min-h-screen md:overflow-visible">
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

        {/* min-h-0 lets the scroll region shrink below its content so it actually
            scrolls (the flexbox overflow gotcha). Desktop: normal flow. */}
        <div className="min-h-0 flex-1 overflow-y-auto md:flex-none md:overflow-visible">
          <CharacterSheetBody
            character={character}
            reference={reference}
            onUpdate={onUpdate}
            activeTab={activeTab}
          />
        </div>
        <RollResultToast />
        <SheetBottomNav tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </RollProvider>
  );
}
