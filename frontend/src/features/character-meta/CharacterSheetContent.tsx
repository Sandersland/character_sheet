import { useState, type ReactNode } from "react";

import RollResultSeal from "@/features/dice/RollResultSeal";
import { RollProvider } from "@/features/dice/RollContext";
import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import CharacterSheetBody from "@/features/character-meta/CharacterSheetBody";
import SheetBottomNav from "@/features/character-meta/SheetBottomNav";
import CharacterSheetModals from "@/features/character-meta/CharacterSheetModals";
import LevelUpBanner from "@/features/level-up/LevelUpBanner";
import { useSheetTabs } from "@/features/character-meta/useSheetTabs";
import { useSwipeTabs } from "@/features/character-meta/useSwipeTabs";
import { useScrollCollapse } from "@/features/character-meta/useScrollCollapse";
import { useCaptureDock } from "@/hooks/useCaptureDock";
import { LiveSessionProvider, useLiveSession } from "@/features/session/LiveSessionProvider";
import { TurnStateProvider, useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import { useLiveRound } from "@/features/session/useLiveRound";
import SessionDoorway from "@/features/session/SessionDoorway";
import CombatLivePanel from "@/features/session/CombatLivePanel";
import { useCombatLifecycle } from "@/features/session/useCombatLifecycle";
import EndSessionPrompt from "@/features/session/EndSessionPrompt";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import type { SheetTabId } from "@/features/character-meta/sheetTabs";
import type { Character, ReferenceData, Session } from "@/types/character";

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
  // Start/Join from the doorway jumps to the Combat tab in-workspace (#963).
  const session = useSessionDoorway(id, () => onTabChange("combat"));
  // Mobile: horizontal swipe on the panel region walks the tabs (clamped).
  const swipe = useSwipeTabs(tabs, activeTab, onTabChange);
  // Mobile: collapse the compact header to a single bar once the panels scroll.
  const collapse = useScrollCollapse();
  const goToCombat = () => onTabChange("combat");

  // #1085: while live + joined the header cluster is the sole live indicator —
  // SessionCue renders nothing on either breakpoint (the Combat nav item still
  // carries a live pip). Non-joined/starting states keep the existing doorway;
  // on the Combat tab nothing renders (D4) — the panel is the context.
  const isLiveJoined = live.status === "liveJoined";
  const isLive = isLiveJoined || live.status === "liveNotJoined";
  const cueProps = {
    activeTab,
    isLiveJoined,
    session,
  };

  // The End/Leave-session lifecycle lifts here (#979) so the persistent sheet
  // header — a sibling of the panel region — can drive it (there is no separate
  // in-panel controls strip anymore). Handlers no-op until a session is joined.
  const life = useCombatLifecycle({ character, session: live.session, onUpdate, live });
  const livePanel = renderLivePanel(
    character,
    live.session,
    Boolean(turnState),
    activeTab === "combat",
    life.handleCharacterUpdate,
  );

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
          reverts to normal flex-1 body scroll within the app shell (nav is
          md:hidden, #1171). */}
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-parchment-100 md:block md:h-auto md:flex-1 md:overflow-visible">
        <CharacterSheetHeader
          character={character}
          onUpdate={life.handleCharacterUpdate}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          isLive={isLive}
          liveRound={liveRound}
          isLiveJoined={isLiveJoined}
          sessionActionBusy={life.sessionActionBusy}
          // Leave is campaign-only (#1082): omit the handler for a solo session
          // so the header hides Leave while keeping End.
          onLeaveSession={life.canLeave ? life.handleLeave : undefined}
          onEndSession={life.openEndPrompt}
          scrolled={collapse.collapsed}
          onGoToCombat={goToCombat}
          onOpenCapture={openCapture}
          onOpenSessions={modals.openSessions}
          onOpenActivity={modals.openActivity}
          onOpenDelete={modals.openDelete}
          onOpenCampaignSettings={modals.openCampaignSettings}
        />

        {/* Armed level-up entry (#892): pinned under the header on every tab,
            above the mobile scroller so it can't scroll away. */}
        <LevelUpBanner character={character} />

        {/* Desktop: session doorway for non-joined states, pinned under the
            header; absent on the Combat tab and while joined (#1085). */}
        <SessionCue placement="desktop" {...cueProps} />

        <CharacterSheetModals
          character={character}
          onUpdate={onUpdate}
          captureSessionId={session.activeSessionId}
          captureSession={session.inActiveSession ? session.activeSession : null}
          deleteOpen={modals.deleteOpen}
          activityOpen={modals.activityOpen}
          sessionsOpen={modals.sessionsOpen}
          campaignSettingsOpen={modals.campaignSettingsOpen}
          captureOpen={captureOpen}
          onCloseDelete={modals.closeDelete}
          onCloseActivity={modals.closeActivity}
          onCloseSessions={modals.closeSessions}
          onCloseCampaignSettings={modals.closeCampaignSettings}
          onCloseCapture={closeCapture}
        />

        {/* min-h-0 lets the scroll region shrink below its content so it actually
            scrolls (the flexbox overflow gotcha). Desktop: normal flow. Mobile:
            horizontal swipe here walks the panel tabs. */}
        <div
          ref={collapse.scrollRef}
          className="min-h-0 flex-1 overflow-y-auto md:flex-none md:overflow-visible"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
          onTouchCancel={swipe.onTouchCancel}
        >
          {/* Collapse-on-scroll sentinel: once it leaves the scroller the mobile
              header collapses (#1026). Mobile-only — desktop doesn't collapse and
              must not gain the 1px this adds to the flow. */}
          <div ref={collapse.sentinelRef} aria-hidden className="h-px w-full md:hidden" />
          <CharacterSheetBody
            character={character}
            reference={reference}
            onUpdate={onUpdate}
            activeTab={activeTab}
            livePanel={livePanel}
            sessionLoading={live.status === "loading"}
          />
        </div>
        <WorkspaceSessionModals characterId={character.id} live={live} life={life} onUpdate={onUpdate} />
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
 * The two workspace-level session overlays (#960/#979), extracted to keep the
 * workspace under the complexity ceiling: the end-of-session recap (outlives the
 * live panel unmounting once the session goes static) and the End-Session confirm
 * prompt (a Modal, triggerable from the sheet header on any tab, not just Combat).
 */
function WorkspaceSessionModals({
  characterId,
  live,
  life,
  onUpdate,
}: {
  characterId: string;
  live: ReturnType<typeof useLiveSession>;
  life: ReturnType<typeof useCombatLifecycle>;
  onUpdate: (c: Character) => void;
}) {
  return (
    <>
      {live.endedSession && (
        <SessionSummaryModal
          characterId={characterId}
          session={live.endedSession}
          onClose={() => live.setEndedSession(null)}
          onCharacterUpdate={onUpdate}
        />
      )}
      {life.endPromptOpen && (
        <EndSessionPrompt
          busy={life.endPending}
          error={life.endError}
          onConfirm={life.handleConfirmEnd}
          onCancel={life.closeEndPrompt}
        />
      )}
      {/* Leave has no modal, so a failed "Leave Session" (from the header) shows
          here as a dismissible toast — otherwise the failure would be silent. */}
      {life.leaveError && (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-card border border-garnet-300 bg-parchment-50 px-4 py-2.5 text-sm text-garnet-800 shadow-card"
        >
          <span className="min-w-0 flex-1">{life.leaveError}</span>
          <button
            type="button"
            onClick={life.dismissLeaveError}
            className="shrink-0 text-xs font-semibold text-garnet-700 hover:text-garnet-900"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The live turn tracker (#960), mounted once (persists across tab switches, so an
 * in-progress picker + economy survive a swipe round-trip). Returns null — not an
 * element — when there's no live session so CharacterSheetBody falls back to the
 * static Combat panel. Extracted so the workspace render stays under the ceiling.
 */
function renderLivePanel(
  character: Character,
  session: Session | null,
  hasTurnState: boolean,
  combatActive: boolean,
  onUpdate: (c: Character) => void,
): ReactNode {
  if (!hasTurnState || !session) return null;
  return <CombatLivePanel character={character} session={session} onUpdate={onUpdate} active={combatActive} />;
}

/**
 * The off-Combat session cue (#961): the existing doorway (start / join /
 * scheduled) for characters not yet in the session. Live-joined state now lives
 * only in the sheet header cluster (#1085), so a joined character sees no cue
 * here on either breakpoint; also nothing on the Combat tab (D4).
 */
function SessionCue({
  placement,
  activeTab,
  isLiveJoined,
  session,
}: {
  placement: "desktop" | "mobile";
  activeTab: SheetTabId;
  isLiveJoined: boolean;
  session: ReturnType<typeof useSessionDoorway>;
}) {
  if (activeTab === "combat") return null;
  if (isLiveJoined) return null;
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

/** The sheet's modal open-state + toggles (delete / activity / sessions /
 *  campaign settings), factored out so the workspace body stays free of inline
 *  handler closures. */
function useSheetModals() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [campaignSettingsOpen, setCampaignSettingsOpen] = useState(false);
  return {
    deleteOpen,
    activityOpen,
    sessionsOpen,
    campaignSettingsOpen,
    openDelete: () => setDeleteOpen(true),
    closeDelete: () => setDeleteOpen(false),
    openActivity: () => setActivityOpen(true),
    closeActivity: () => setActivityOpen(false),
    openSessions: () => setSessionsOpen(true),
    closeSessions: () => setSessionsOpen(false),
    openCampaignSettings: () => setCampaignSettingsOpen(true),
    closeCampaignSettings: () => setCampaignSettingsOpen(false),
  };
}
