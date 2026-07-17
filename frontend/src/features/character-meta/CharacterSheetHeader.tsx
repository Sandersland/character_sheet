import { Link } from "react-router-dom";

import BackendStatus from "@/features/character-meta/BackendStatus";
import BannerVitals from "@/features/character-meta/BannerVitals";
import MobileSheetHeader from "@/features/character-meta/MobileSheetHeader";
import CampaignIndicator from "@/features/campaign/CampaignIndicator";
import OverflowMenu from "@/components/ui/OverflowMenu";
import Tabs from "@/components/ui/Tabs";
import { classSummary } from "@/lib/multiclass";
import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";
import type { Character } from "@/types/character";

interface CharacterSheetHeaderProps {
  character: Character;
  /** Applies HP edits from the header's tappable HP readout (#982) — routed to
   *  `handleCharacterUpdate` so damage/heal also bumps the session log. */
  onUpdate: (c: Character) => void;
  tabs: SheetTab[];
  activeTab: SheetTabId;
  onTabChange: (id: SheetTabId) => void;
  /** A session is live (joined or joinable) — drives the banner live badge + the
   *  Combat tab pip on the desktop tab bar (#964, mirrors the mobile nav pip). */
  isLive?: boolean;
  /** The active combat round to show in the live strip pill (null = live but not
   *  in combat, or not joined). */
  liveRound?: number | null;
  /** The live session's title, shown on the slim live strip / mobile fight bar. */
  sessionName?: string | null;
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

/** Annotate the Combat tab with a gold "session live" pip (#961/#964); every
 *  other tab passes through. Extracted so the header component stays under the
 *  cognitive-complexity ceiling. */
function withCombatLivePip(tabs: SheetTab[], isLive: boolean): SheetTab[] {
  if (!isLive) return tabs;
  return tabs.map((tab) =>
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
  );
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
  onUpdate,
  tabs,
  activeTab,
  onTabChange,
  isLive = false,
  liveRound = null,
  sessionName = null,
  isLiveJoined = false,
  sessionActionBusy = false,
  onLeaveSession,
  onEndSession,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: CharacterSheetHeaderProps) {
  // Desktop tab bar mirrors the mobile nav pip: a gold dot on Combat while live.
  const bannerTabs = withCombatLivePip(tabs, isLive);
  return (
    <>
      {/* Mobile: compact sticky mini-header. Desktop: the garnet banner below. */}
      <MobileSheetHeader
        character={character}
        onUpdate={onUpdate}
        sessionActions={
          isLiveJoined && onLeaveSession && onEndSession
            ? { busy: sessionActionBusy, onLeave: onLeaveSession, onEnd: onEndSession }
            : null
        }
        combatActive={activeTab === "combat"}
        liveRound={liveRound}
        sessionName={sessionName}
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
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <BackendStatus />
            <BannerActions
              uncampaigned={!character.campaignId}
              isLiveJoined={isLiveJoined}
              onOpenCapture={onOpenCapture}
              onOpenSessions={onOpenSessions}
              onOpenActivity={onOpenActivity}
              onOpenDelete={onOpenDelete}
            />
          </div>
        </div>

        {/* Slim live strip (#985): the one place carrying session identity +
            controls while live. Full-bleed garnet band under the hero; replaces
            the scattered banner-nav session links + the old floating round badge
            (exactly one round indicator). */}
        {isLive && (
          <DesktopLiveStrip
            sessionName={sessionName}
            liveRound={liveRound}
            isLiveJoined={isLiveJoined}
            sessionActionBusy={sessionActionBusy}
            onOpenCapture={onOpenCapture}
            onLeaveSession={onLeaveSession}
            onEndSession={onEndSession}
          />
        )}

        {/* Always-on vitals */}
        <div className="mt-4">
          <BannerVitals character={character} onUpdate={onUpdate} />
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

// Shared banner-button styles: a bordered "chip", a plain garnet-text link, and
// a light kebab trigger for the garnet surface.
const BANNER_CHIP =
  "rounded-control border border-parchment-50/60 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-white/10 disabled:opacity-50";
const BANNER_LINK =
  "text-xs font-semibold text-garnet-100 transition-colors hover:text-parchment-50 disabled:opacity-50";
const BANNER_KEBAB =
  "flex h-7 w-7 items-center justify-center rounded-control text-parchment-100 transition-colors hover:bg-white/10 hover:text-parchment-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment-50/60";

/** The desktop banner's right-hand action cluster (#985). Sheet-level chrome
 *  only — the session controls (Note/Leave/End) live on the live strip while
 *  joined, so the ＋ Note quick-capture chip stays here only when NOT joined.
 *  Delete is demoted behind the ⋯ overflow so it never sits next to End session. */
function BannerActions({
  uncampaigned,
  isLiveJoined,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: {
  uncampaigned: boolean;
  isLiveJoined: boolean;
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
      {/* Cmd/Ctrl+J quick-capture. While joined this affordance moves onto the
          live strip alongside Leave/End, so it isn't duplicated here. */}
      {!isLiveJoined && (
        <button type="button" onClick={onOpenCapture} className={BANNER_CHIP}>
          ＋ Note
        </button>
      )}
      <button type="button" onClick={onOpenSessions} className={BANNER_LINK}>
        Sessions
      </button>
      <button type="button" onClick={onOpenActivity} className={BANNER_LINK}>
        Activity
      </button>
      <OverflowMenu
        label="Sheet actions"
        triggerClassName={BANNER_KEBAB}
        items={[{ label: "Delete", onSelect: onOpenDelete, danger: true }]}
      />
    </div>
  );
}

// Live-strip control styles: a ghost-outlined button vs the one solid End-session.
const STRIP_BTN =
  "rounded-control border border-parchment-50/30 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-white/10 disabled:opacity-50";
const STRIP_BTN_SOLID =
  "rounded-control bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-garnet-800 transition-colors hover:bg-parchment-100 disabled:opacity-50";

/** The slim garnet live strip (#985): pip · session identity · Round/Live pill ·
 *  Note / Leave / End session. Full-bleed band under the hero (the `-mx-6 px-6`
 *  bleeds it past the container padding). Calm chrome — flat, one solid accent
 *  (End session) — so it never competes with the elevated turn tracker. */
function DesktopLiveStrip({
  sessionName,
  liveRound,
  isLiveJoined,
  sessionActionBusy,
  onOpenCapture,
  onLeaveSession,
  onEndSession,
}: {
  sessionName: string | null;
  liveRound: number | null;
  isLiveJoined: boolean;
  sessionActionBusy: boolean;
  onOpenCapture: () => void;
  onLeaveSession?: () => void;
  onEndSession?: () => void;
}) {
  return (
    <div className="-mx-6 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-parchment-50/15 bg-garnet-900/60 px-6 py-2">
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-vitality-100 ring-4 ring-vitality-500/30" />
      <span className="min-w-0 truncate text-sm font-bold text-parchment-50">
        Live session
        {sessionName && <span className="font-semibold text-garnet-100"> · {sessionName}</span>}
      </span>
      <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-parchment-50">
        {liveRound != null ? `Round ${liveRound}` : "Live"}
      </span>
      {isLiveJoined && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onOpenCapture} className={STRIP_BTN}>
            ＋ Note
          </button>
          {onLeaveSession && (
            <button type="button" disabled={sessionActionBusy} onClick={onLeaveSession} className={STRIP_BTN}>
              Leave Session
            </button>
          )}
          {onEndSession && (
            <button type="button" disabled={sessionActionBusy} onClick={onEndSession} className={STRIP_BTN_SOLID}>
              End Session
            </button>
          )}
        </div>
      )}
    </div>
  );
}
