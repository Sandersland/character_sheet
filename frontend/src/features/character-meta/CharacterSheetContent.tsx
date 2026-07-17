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
import { useLiveRound } from "@/features/session/useLiveRound";
import SessionDoorway from "@/features/session/SessionDoorway";
import LiveSessionStrip from "@/features/session/LiveSessionStrip";
import CombatLivePanel from "@/features/session/CombatLivePanel";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import type { SheetTabId } from "@/features/character-meta/sheetTabs";
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
  const modals = useSheetModals();
  // Cmd/Ctrl+J toggles the quick-capture dock from anywhere on the sheet.
  const { captureOpen, openCapture, closeCapture } = useCaptureDock();
  // Session-log invalidation is shared with RollProvider so a logged roll and
  // the log view use one counter (#959).
  const live = useLiveSession();
  const turnState = useTurnStateContext();
  const liveRound = useLiveRound();
  const session = useSessionDoorway(id);
  // Mobile: horizontal swipe on the panel region walks the tabs (clamped).
  const swipe = useSwipeTabs(tabs, activeTab, onTabChange);

  // #961: while a session is live + joined, off-Combat tabs show a "Go to fight"
  // strip (an in-workspace jump to Combat) instead of the doorway; the Combat
  // nav item carries a live pip. On the Combat tab, no strip (D4) — the panel is
  // the context. Non-joined/starting states keep the existing doorway.
  const isLiveJoined = live.status === "liveJoined";
  const isLive = isLiveJoined || live.status === "liveNotJoined";
  const cueProps = {
    activeTab,
    isLiveJoined,
    session,
    liveRound,
    onGoToCombat: () => onTabChange("combat"),
  };

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
          onOpenSessions={modals.openSessions}
          onOpenActivity={modals.openActivity}
          onOpenDelete={modals.openDelete}
        />

        {/* Desktop: the session cue (live-strip when joined, else doorway),
            pinned under the garnet banner; absent on the Combat tab (#961). */}
        <SessionCue placement="desktop" {...cueProps} />

        <CharacterSheetModals
          character={character}
          onUpdate={onUpdate}
          captureSessionId={session.activeSessionId}
          captureSession={session.inActiveSession ? session.activeSession : null}
          deleteOpen={modals.deleteOpen}
          activityOpen={modals.activityOpen}
          sessionsOpen={modals.sessionsOpen}
          captureOpen={captureOpen}
          onCloseDelete={modals.closeDelete}
          onCloseActivity={modals.closeActivity}
          onCloseSessions={modals.closeSessions}
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
        {/* Mobile: the session cue (live-strip / doorway), between the panels
            and the bottom nav; absent on the Combat tab (#961). */}
        <SessionCue placement="mobile" {...cueProps} />
        <SheetBottomNav
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          livePipTab={isLive ? "combat" : null}
        />
      </div>
    </RollProvider>
  );
}

/**
 * The off-Combat session cue (#961): the live-joined "Go to fight" strip (an
 * in-workspace jump to Combat) when live+joined, else the existing doorway
 * (start / join / scheduled). Renders nothing on the Combat tab (D4).
 */
function SessionCue({
  placement,
  activeTab,
  isLiveJoined,
  session,
  liveRound,
  onGoToCombat,
}: {
  placement: "desktop" | "mobile";
  activeTab: SheetTabId;
  isLiveJoined: boolean;
  session: ReturnType<typeof useSessionDoorway>;
  liveRound: number | null;
  onGoToCombat: () => void;
}) {
  if (activeTab === "combat") return null;
  if (isLiveJoined) {
    return (
      <LiveSessionStrip
        placement={placement}
        title={session.activeSession?.title ?? null}
        round={liveRound}
        onGoToCombat={onGoToCombat}
      />
    );
  }
  return (
    <SessionDoorway
      placement={placement}
      summary={session.summary}
      sessionTitle={session.activeSession?.title}
      pending={session.pending}
      error={session.error}
      onAction={session.onAction}
    />
  );
}

/** The sheet's modal open-state + toggles (delete / activity / sessions),
 *  factored out so the workspace body stays free of inline handler closures. */
function useSheetModals() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  return {
    deleteOpen,
    activityOpen,
    sessionsOpen,
    openDelete: () => setDeleteOpen(true),
    closeDelete: () => setDeleteOpen(false),
    openActivity: () => setActivityOpen(true),
    closeActivity: () => setActivityOpen(false),
    openSessions: () => setSessionsOpen(true),
    closeSessions: () => setSessionsOpen(false),
  };
}
