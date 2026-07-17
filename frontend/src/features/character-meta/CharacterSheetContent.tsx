import { useState } from "react";

import RollResultSeal from "@/features/dice/RollResultSeal";
import { RollProvider } from "@/features/dice/RollContext";
import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import CharacterSheetBody from "@/features/character-meta/CharacterSheetBody";
import SheetBottomNav from "@/features/character-meta/SheetBottomNav";
import CharacterSheetModals from "@/features/character-meta/CharacterSheetModals";
import { useSheetTabs } from "@/features/character-meta/useSheetTabs";
import { useSwipeTabs } from "@/features/character-meta/useSwipeTabs";
import { useCaptureDock } from "@/hooks/useCaptureDock";
import { LiveSessionProvider, useLiveSession } from "@/features/session/LiveSessionProvider";
import { TurnStateProvider, useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import SessionDoorway from "@/features/session/SessionDoorway";
import CombatLivePanel from "@/features/session/CombatLivePanel";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import type { Character, ReferenceData } from "@/types/character";

interface CharacterSheetContentProps {
  id: string | undefined;
  character: Character;
  reference: ReferenceData | null;
  onUpdate: (c: Character) => void;
}

/**
 * The loaded-sheet view. Wraps the workspace in the shared session providers
 * (#959) — `LiveSessionProvider` (is a session live + am I in it) above
 * `TurnStateProvider` (the single turn-state instance) — so the Combat tab, the
 * live strip, the nav pip, and the doorway all read one server-derived source.
 */
export default function CharacterSheetContent(props: CharacterSheetContentProps) {
  return (
    <LiveSessionProvider characterId={props.character.id}>
      <TurnStateProvider character={props.character}>
        <CharacterSheetWorkspace {...props} />
      </TurnStateProvider>
    </LiveSessionProvider>
  );
}

/**
 * The sheet body: banner + tab panels + the roll/modal chrome. Split from
 * CharacterSheetPage so the page holds only load/error/guard states and this
 * owns the per-character interaction state (tabs, modals, capture dock, doorway).
 */
function CharacterSheetWorkspace({
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
  // Session-log invalidation is shared with RollProvider so a logged roll and
  // the log view use one counter (#959).
  const live = useLiveSession();
  const turnState = useTurnStateContext();
  const session = useSessionDoorway(id);
  // Mobile: horizontal swipe on the panel region walks the tabs (clamped).
  const swipe = useSwipeTabs(tabs, activeTab, onTabChange);

  // #960: when a session is live AND this character is in it, the Combat tab
  // renders the live turn tracker instead of the static combat panel. Mounted
  // once here (persists across tab switches, so an in-progress picker + economy
  // survive a swipe round-trip); visible only while Combat is the active tab.
  const livePanel =
    turnState && live.session ? (
      <CombatLivePanel
        character={character}
        session={live.session}
        onUpdate={onUpdate}
        active={activeTab === "combat"}
        onCapture={openCapture}
      />
    ) : null;

  return (
    <RollProvider
      characterId={character.id}
      sessionId={session.inActiveSession ? session.activeSessionId : null}
      onRollLogged={live.bumpLog}
      rollModifiers={character.rollModifiers}
    >
      {/* Mobile: a 100dvh app-shell — fixed header + in-flow bottom nav with the
          panels scrolling in the middle, so iOS Safari's dynamic toolbar can't
          shift a body-scrolled fixed nav (no gap; nav always flush). Desktop
          reverts to normal min-h-screen body scroll (nav is md:hidden). */}
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-parchment-100 md:block md:h-auto md:min-h-screen md:overflow-visible">
        <CharacterSheetHeader
          character={character}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onOpenCapture={openCapture}
          onOpenSessions={() => setSessionsOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onOpenDelete={() => setConfirmDeleteOpen(true)}
        />

        {/* Desktop: the session doorway strip, pinned under the garnet banner. */}
        <SessionDoorway
          placement="desktop"
          summary={session.summary}
          sessionTitle={session.activeSession?.title}
          pending={session.pending}
          error={session.error}
          onAction={session.onAction}
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
            scrolls (the flexbox overflow gotcha). Desktop: normal flow. Mobile:
            horizontal swipe here walks the panel tabs. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto md:flex-none md:overflow-visible"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
          onTouchCancel={swipe.onTouchCancel}
        >
          <CharacterSheetBody
            character={character}
            reference={reference}
            onUpdate={onUpdate}
            activeTab={activeTab}
            livePanel={livePanel}
            sessionLoading={live.status === "loading"}
          />
        </div>
        {/* End-of-session recap — at the workspace level so it outlives the live
            panel unmounting when the session goes static after End (#960). */}
        {live.endedSession && (
          <SessionSummaryModal
            characterId={character.id}
            session={live.endedSession}
            onClose={() => live.setEndedSession(null)}
            onCharacterUpdate={onUpdate}
          />
        )}
        <RollResultSeal />
        {/* Mobile: the session doorway bar, between the panels and the bottom nav. */}
        <SessionDoorway
          placement="mobile"
          summary={session.summary}
          sessionTitle={session.activeSession?.title}
          pending={session.pending}
          error={session.error}
          onAction={session.onAction}
        />
        <SheetBottomNav tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </RollProvider>
  );
}
