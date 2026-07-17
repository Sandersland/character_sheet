import { Link } from "react-router-dom";

import BackendStatus from "@/features/character-meta/BackendStatus";
import BannerVitals from "@/features/character-meta/BannerVitals";
import MobileSheetHeader from "@/features/character-meta/MobileSheetHeader";
import CampaignIndicator from "@/features/campaign/CampaignIndicator";
import Tabs from "@/components/ui/Tabs";
import { classSummary } from "@/lib/multiclass";
import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";
import type { Character } from "@/types/character";

interface CharacterSheetHeaderProps {
  character: Character;
  tabs: SheetTab[];
  activeTab: SheetTabId;
  onTabChange: (id: SheetTabId) => void;
  /** A session is live (joined or joinable) — drives the banner live badge + the
   *  Combat tab pip on the desktop tab bar (#964, mirrors the mobile nav pip). */
  isLive?: boolean;
  /** The active combat round to show in the banner badge (null = live but not in
   *  combat, or not joined). */
  liveRound?: number | null;
  /** This character is in the live session — surfaces Leave/End Session in the
   *  sheet header's own menu (there's no separate in-panel strip, #979). */
  isLiveJoined?: boolean;
  /** A leave/end is in flight — disables those items. */
  sessionActionBusy?: boolean;
  onLeaveSession?: () => void;
  onEndSession?: () => void;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
}

/**
 * The persistent sheet header, rendered per breakpoint: the compact
 * MobileSheetHeader (`md:hidden`) and the desktop garnet banner (`hidden
 * md:block`) — identity + always-on vitals + the workspace tab bar. Desktop
 * stays put while the tab panels swap below it (the "1d / Codex" direction, epic
 * #921); mobile navigation is the SheetBottomNav.
 */
export default function CharacterSheetHeader({
  character,
  tabs,
  activeTab,
  onTabChange,
  isLive = false,
  liveRound = null,
  isLiveJoined = false,
  sessionActionBusy = false,
  onLeaveSession,
  onEndSession,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: CharacterSheetHeaderProps) {
  // Desktop tab bar mirrors the mobile nav pip: a gold dot on Combat while live
  // (#961/#964). Annotate the Combat tab's badge; leave every other tab as-is.
  const bannerTabs: SheetTab[] = isLive
    ? tabs.map((tab) =>
        tab.id === "combat"
          ? {
              ...tab,
              badge: (
                <>
                  <span className="block h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden />
                  <span className="sr-only"> (session live)</span>
                </>
              ),
            }
          : tab,
      )
    : tabs;
  return (
    <>
      {/* Mobile: compact sticky mini-header. Desktop: the garnet banner below. */}
      <MobileSheetHeader
        character={character}
        sessionActions={
          isLiveJoined && onLeaveSession && onEndSession
            ? { busy: sessionActionBusy, onLeave: onLeaveSession, onEnd: onEndSession }
            : null
        }
        onOpenCapture={onOpenCapture}
        onOpenSessions={onOpenSessions}
        onOpenActivity={onOpenActivity}
        onOpenDelete={onOpenDelete}
      />
      <header className="hidden bg-gradient-to-br from-garnet-800 via-garnet-700 to-garnet-900 text-parchment-50 md:block">
      <div className="mx-auto max-w-6xl px-6 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Level crest */}
            <div className="flex h-14 w-14 flex-none flex-col items-center justify-center rounded-full border-2 border-garnet-200 bg-garnet-900/50 shadow-raised">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-garnet-100">
                Lvl
              </span>
              <span className="font-display text-2xl font-semibold leading-none text-parchment-50">
                {character.level}
              </span>
            </div>
            <div>
              <Link
                to="/"
                className="text-xs font-semibold text-garnet-100 transition-colors hover:text-parchment-50"
              >
                ← All characters
              </Link>
              <h1 className="mt-1 font-display text-3xl font-semibold text-parchment-50">
                {character.name}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-garnet-100">
                <span>
                  {character.race}{" "}
                  {classSummary(character.classes, {
                    name: character.class,
                    subclass: character.subclass,
                  })}
                </span>
                <span aria-hidden>·</span>
                <span>
                  {character.background} · {character.alignment}
                </span>
                <CampaignIndicator character={character} />
              </p>
              {/* Always-on live-state badge (#964): the desktop banner never
                  navigates, so it carries the "is a session live / what round"
                  signal the mobile strip provides below the fold. */}
              {isLive && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-garnet-900/50 px-2.5 py-0.5 text-xs font-semibold text-parchment-50 ring-1 ring-parchment-50/30">
                  <span aria-hidden>⚔</span>
                  {liveRound != null ? `Round ${liveRound}` : "Live"}
                  <span className="sr-only"> session in progress</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <BackendStatus />
            <BannerActions
              uncampaigned={!character.campaignId}
              isLiveJoined={isLiveJoined}
              sessionActionBusy={sessionActionBusy}
              onLeaveSession={onLeaveSession}
              onEndSession={onEndSession}
              onOpenCapture={onOpenCapture}
              onOpenSessions={onOpenSessions}
              onOpenActivity={onOpenActivity}
              onOpenDelete={onOpenDelete}
            />
          </div>
        </div>

        {/* Always-on vitals */}
        <div className="mt-4">
          <BannerVitals character={character} />
        </div>

        {/* Workspace tab bar (desktop only; mobile uses the docked SheetBottomNav) */}
        <div className="mt-4 hidden pb-4 md:block">
          <Tabs
            tabs={bannerTabs}
            active={activeTab}
            onChange={(id) => onTabChange(id as SheetTabId)}
            idBase="sheet"
          />
        </div>
      </div>
      </header>
    </>
  );
}

// Shared banner-button styles: a bordered "chip" vs a plain garnet-text link.
const BANNER_CHIP =
  "rounded-control border border-parchment-50/60 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-white/10 disabled:opacity-50";
const BANNER_LINK =
  "text-xs font-semibold text-garnet-100 transition-colors hover:text-parchment-50 disabled:opacity-50";

/** The desktop banner's right-hand action cluster. Extracted so the header stays
 *  under the complexity ceiling (#979). Live-session controls (Leave/End) show
 *  only while joined — there's no separate in-panel strip anymore. */
function BannerActions({
  uncampaigned,
  isLiveJoined,
  sessionActionBusy,
  onLeaveSession,
  onEndSession,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: {
  uncampaigned: boolean;
  isLiveJoined: boolean;
  sessionActionBusy: boolean;
  onLeaveSession?: () => void;
  onEndSession?: () => void;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {/* Campaign-less characters have no doorway, so keep the invite here (#942). */}
      {uncampaigned && (
        <Link to="/campaigns" title="Join a campaign to play a shared session" className={BANNER_CHIP}>
          Join a campaign
        </Link>
      )}
      {/* Cmd/Ctrl+J quick-capture; this button is the touch-discoverable affordance. */}
      <button type="button" onClick={onOpenCapture} className={BANNER_CHIP}>
        ＋ Note
      </button>
      <button type="button" onClick={onOpenSessions} className={BANNER_LINK}>
        Sessions
      </button>
      <button type="button" onClick={onOpenActivity} className={BANNER_LINK}>
        Activity
      </button>
      {isLiveJoined && onLeaveSession && (
        <button type="button" disabled={sessionActionBusy} onClick={onLeaveSession} className={BANNER_LINK}>
          Leave Session
        </button>
      )}
      {isLiveJoined && onEndSession && (
        <button type="button" disabled={sessionActionBusy} onClick={onEndSession} className={BANNER_CHIP}>
          End Session
        </button>
      )}
      <button type="button" onClick={onOpenDelete} className={BANNER_LINK}>
        Delete
      </button>
    </div>
  );
}
