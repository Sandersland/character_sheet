import { lazy, Suspense, useState, type ReactNode } from "react";

import RollResultSeal from "@/features/dice/RollResultSeal";
import { RollProvider } from "@/features/dice/RollContext";
import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import CharacterSheetBody from "@/features/character-meta/CharacterSheetBody";
import SheetBottomNav from "@/features/character-meta/SheetBottomNav";
import CharacterSheetModals from "@/features/character-meta/CharacterSheetModals";
import DelayedSpinner from "@/components/ui/DelayedSpinner";
import LevelUpBanner from "@/features/level-up/LevelUpBanner";
import { useSheetTabs } from "@/features/character-meta/useSheetTabs";
import { useSwipeTabs } from "@/features/character-meta/useSwipeTabs";
import { useScrollCollapse } from "@/features/character-meta/useScrollCollapse";
import { useCaptureDock } from "@/hooks/useCaptureDock";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useReferenceData } from "@/hooks/useReferenceData";
import { LiveSessionProvider, useLiveSession } from "@/features/session/LiveSessionProvider";
import { TurnStateProvider, useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import { useLiveRound } from "@/features/session/useLiveRound";
import SessionDoorway from "@/features/session/SessionDoorway";
import { useCombatLifecycle } from "@/features/session/useCombatLifecycle";
import { useSessionLogBumpOnCharacterWrite } from "@/features/session/useSessionLogBumpOnCharacterWrite";
import EndSessionPrompt from "@/features/session/EndSessionPrompt";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";
import type { ReferenceData, Session } from "@/types/character";

const CombatLivePanel = lazy(() => import("@/features/session/CombatLivePanel"));

export default function CharacterSheetContent() {
  const { character } = useCurrentCharacter();
  const { reference } = useReferenceData(character.rulesEdition);
  return (
    <LiveSessionProvider characterId={character.id}>
      <TurnStateProvider>
        <CharacterSheetWorkspace reference={reference} />
      </TurnStateProvider>
    </LiveSessionProvider>
  );
}

function CharacterSheetWorkspace({ reference }: { reference: ReferenceData | null }) {
  const { character, tabs, activeTab, onTabChange } = useCharacterTabs();
  const modals = useSheetModals();
  const { captureOpen, openCapture, closeCapture } = useCaptureDock();
  // Shared with RollProvider so a logged roll and the log view use one invalidation counter (#959).
  const live = useLiveSession();
  useSessionLogBumpOnCharacterWrite(live.bumpLog);
  const turnState = useTurnStateContext();
  const liveRound = useLiveRound();
  const session = useSessionDoorway(character.id, () => onTabChange("combat"));
  const { swipe, collapse } = useMobileSheetGestures(tabs, activeTab, onTabChange);
  const goToCombat = () => onTabChange("combat");

  const isLiveJoined = live.status === "liveJoined";
  const isLive = isLiveJoined || live.status === "liveNotJoined";
  const cueProps = {
    activeTab,
    isLiveJoined,
    session,
  };

  const life = useCombatLifecycle({ character, session: live.session, live });
  const livePanel = renderLivePanel(live.session, Boolean(turnState), activeTab === "combat");

  return (
    <RollProvider
      characterId={character.id}
      sessionId={session.inActiveSession ? session.activeSessionId : null}
      onRollLogged={live.bumpLog}
      rollModifiers={character.rollModifiers}
    >
      {/* 100dvh app-shell keeps the bottom nav flush — iOS Safari's dynamic toolbar shifts a body-scrolled fixed nav otherwise. */}
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-parchment-100 md:block md:h-auto md:flex-1 md:overflow-visible">
        <CharacterSheetHeader
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          isLive={isLive}
          liveRound={liveRound}
          isLiveJoined={isLiveJoined}
          sessionActionBusy={life.sessionActionBusy}
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

        
        <LevelUpBanner />

        
        <SessionCue placement="desktop" {...cueProps} />

        <CharacterSheetModals
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

        {/* min-h-0 lets this region shrink below its content height so it can scroll (flexbox overflow gotcha). */}
        <div
          ref={collapse.scrollRef}
          className="min-h-0 flex-1 overflow-y-auto md:flex-none md:overflow-visible"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
          onTouchCancel={swipe.onTouchCancel}
        >
          {/* Mobile-only — must not add its 1px to desktop's flow. */}
          <div ref={collapse.sentinelRef} aria-hidden className="h-px w-full md:hidden" />
          <CharacterSheetBody
            reference={reference}
            activeTab={activeTab}
            livePanel={livePanel}
            sessionLoading={live.status === "loading"}
            isLive={isLive}
            onGoToCombat={goToCombat}
          />
        </div>
        <WorkspaceSessionModals characterId={character.id} live={live} life={life} />
        <RollResultSeal />
        
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

function WorkspaceSessionModals({
  characterId,
  live,
  life,
}: {
  characterId: string;
  live: ReturnType<typeof useLiveSession>;
  life: ReturnType<typeof useCombatLifecycle>;
}) {
  return (
    <>
      {live.endedSession && (
        <SessionSummaryModal
          characterId={characterId}
          session={live.endedSession}
          onClose={() => live.setEndedSession(null)}
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

function renderLivePanel(
  session: Session | null,
  hasTurnState: boolean,
  combatActive: boolean,
): ReactNode {
  if (!hasTurnState || !session) return null;
  return (
    <Suspense fallback={<DelayedSpinner />}>
      <CombatLivePanel session={session} active={combatActive} />
    </Suspense>
  );
}

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

// Grouped into one hook: fallow scores a hook's cognitive load by its delegating closures.
function useCharacterTabs() {
  const { character } = useCurrentCharacter();
  const { tabs, activeTab, onTabChange } = useSheetTabs(character);
  return { character, tabs, activeTab, onTabChange };
}

function useMobileSheetGestures(tabs: SheetTab[], activeTab: SheetTabId, onTabChange: (id: SheetTabId) => void) {
  const swipe = useSwipeTabs(tabs, activeTab, onTabChange);
  const collapse = useScrollCollapse();
  return { swipe, collapse };
}

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
