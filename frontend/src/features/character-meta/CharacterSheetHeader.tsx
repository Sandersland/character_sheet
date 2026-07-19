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
  /** Propagates HP edits so damage/heal also bumps the session log (#982).
   *  Used by the mobile header's tappable HP readout; desktop live-play HP
   *  lives in CombatUtilityStrip (#1085). */
  onUpdate: (c: Character) => void;
  tabs: SheetTab[];
  activeTab: SheetTabId;
  onTabChange: (id: SheetTabId) => void;
  /** A session is live (joined or joinable) — drives the banner live badge + the
   *  Combat tab pip on the desktop tab bar (#964, mirrors the mobile nav pip). */
  isLive?: boolean;
  /** The active combat round to show in the live pill (null = live but not in
   *  combat, or not joined). */
  liveRound?: number | null;
  /** This character is in the live session — surfaces Leave/End Session in the
   *  banner cluster (desktop) / ⋯ menu (mobile), #979. */
  isLiveJoined?: boolean;
  /** A leave/end is in flight — disables those items. */
  sessionActionBusy?: boolean;
  onLeaveSession?: () => void;
  onEndSession?: () => void;
  /** Mobile only (#1026): the panel scroller has scrolled past the top, so the
   *  compact header collapses to a single bar. */
  scrolled?: boolean;
  /** Mobile only (#1026): jump to the Combat tab — the live pill's tap target. */
  onGoToCombat?: () => void;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
}

/** The mobile header's folded-in Leave/End controls (#979), present only while
 *  this character is in a live session. Extracted so the header render stays
 *  under the cognitive ceiling. */
function buildSessionActions(
  isLiveJoined: boolean,
  busy: boolean,
  onLeave?: () => void,
  onEnd?: () => void,
): { busy: boolean; onLeave: () => void; onEnd: () => void } | null {
  if (!isLiveJoined || !onLeave || !onEnd) return null;
  return { busy, onLeave, onEnd };
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
              <span
                className="block h-1.5 w-1.5 rounded-full bg-gold-400"
                aria-hidden
              />
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
  isLiveJoined = false,
  sessionActionBusy = false,
  onLeaveSession,
  onEndSession,
  scrolled = false,
  onGoToCombat,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: CharacterSheetHeaderProps) {
  return (
    <>
      {/* Mobile: compact sticky mini-header. Desktop: the garnet banner below. */}
      <MobileSheetHeader
        character={character}
        onUpdate={onUpdate}
        sessionActions={buildSessionActions(
          isLiveJoined,
          sessionActionBusy,
          onLeaveSession,
          onEndSession,
        )}
        liveRound={liveRound}
        scrolled={scrolled}
        onGoToCombat={onGoToCombat}
        onOpenCapture={onOpenCapture}
        onOpenSessions={onOpenSessions}
        onOpenActivity={onOpenActivity}
        onOpenDelete={onOpenDelete}
      />
      <DesktopBanner
        character={character}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        isLive={isLive}
        liveRound={liveRound}
        isLiveJoined={isLiveJoined}
        sessionActionBusy={sessionActionBusy}
        onLeaveSession={onLeaveSession}
        onEndSession={onEndSession}
        onOpenCapture={onOpenCapture}
        onOpenSessions={onOpenSessions}
        onOpenActivity={onOpenActivity}
        onOpenDelete={onOpenDelete}
      />
    </>
  );
}

/**
 * The desktop banner (`hidden md:block`): level crest + identity + the always-on
 * vitals + workspace tab bar. The right-hand action cluster is the sole live-state
 * indicator while a session is live (#1085 — the old under-tabs strip is gone).
 * Extracted from CharacterSheetHeader so each render function stays shallow; the
 * mobile counterpart is MobileSheetHeader.
 */
function DesktopBanner({
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
}: Omit<CharacterSheetHeaderProps, "scrolled" | "onGoToCombat" | "onUpdate">) {
  // Desktop tab bar mirrors the mobile nav pip: a gold dot on Combat while live.
  const bannerTabs = withCombatLivePip(tabs, isLive);
  return (
    <header className="hidden border-b border-parchment-200 bg-parchment-50 text-parchment-900 md:block">
      {/* Thin garnet top rule — the one saturated accent on the light surface. */}
      <div
        aria-hidden
        className="h-[5px] bg-gradient-to-r from-garnet-800 via-garnet-600 to-garnet-800"
      />
      <div className="mx-auto max-w-6xl px-6 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Level crest */}
            <div className="flex h-14 w-14 flex-none flex-col items-center justify-center rounded-full border-2 border-garnet-600 bg-parchment-50 shadow-raised">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-garnet-700">
                Lvl
              </span>
              <span className="font-display text-2xl font-semibold leading-none text-garnet-700">
                {character.level}
              </span>
            </div>
            <div>
              <Link
                to="/"
                className="text-xs font-semibold text-parchment-700 transition-colors hover:text-garnet-700"
              >
                ← All characters
              </Link>
              <h1 className="mt-1 font-display text-3xl font-semibold text-parchment-900">
                {character.name}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-parchment-700">
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
              isLive={isLive}
              liveRound={liveRound}
              isLiveJoined={isLiveJoined}
              sessionActionBusy={sessionActionBusy}
              onOpenCapture={onOpenCapture}
              onOpenSessions={onOpenSessions}
              onOpenActivity={onOpenActivity}
              onOpenDelete={onOpenDelete}
              onLeaveSession={onLeaveSession}
              onEndSession={onEndSession}
            />
          </div>
        </div>

        {/* Bottom row: workspace tabs (left) + always-on stat cards (right).
            Mobile uses the docked SheetBottomNav for tabs. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pb-4">
          <Tabs
            tabs={bannerTabs}
            active={activeTab}
            onChange={(id) => onTabChange(id as SheetTabId)}
            idBase="sheet"
          />
          <BannerVitals character={character} />
        </div>
      </div>
    </header>
  );
}

// Shared banner-button styles for the light surface: a bordered "chip", a solid
// garnet End-session accent, a garnet-text link, and a muted-ink kebab trigger.
const BANNER_CHIP =
  "rounded-control border border-parchment-300 px-3 py-1.5 text-xs font-semibold text-parchment-800 transition-colors hover:bg-parchment-100 disabled:opacity-50";
const BANNER_CHIP_SOLID =
  "rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-700 disabled:opacity-50";
const BANNER_LINK =
  "text-xs font-semibold text-garnet-700 transition-colors hover:text-garnet-900 disabled:opacity-50";
const BANNER_KEBAB =
  "flex h-7 w-7 items-center justify-center rounded-control text-parchment-700 transition-colors hover:bg-parchment-100 hover:text-parchment-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";

/** The desktop banner's right-hand action cluster (#985/#1085) — the sole live
 *  indicator now the under-tabs strip is gone: a `Live · Round N` pill + ＋ Note,
 *  plus Leave/End Session while joined. Delete is demoted behind the ⋯ overflow so
 *  it never sits next to End session. */
function BannerActions({
  uncampaigned,
  isLive,
  liveRound,
  isLiveJoined,
  sessionActionBusy,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
  onLeaveSession,
  onEndSession,
}: {
  uncampaigned: boolean;
  isLive: boolean;
  liveRound: number | null;
  isLiveJoined: boolean;
  sessionActionBusy: boolean;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
  onLeaveSession?: () => void;
  onEndSession?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {isLive && (
        <span className="rounded-full bg-garnet-600 px-3 py-1 text-xs font-bold text-parchment-50">
          {liveRound != null ? `Live · Round ${liveRound}` : "Live"}
        </span>
      )}
      {/* Campaign-less characters have no doorway, so keep the invite here (#942). */}
      {uncampaigned && (
        <Link
          to="/campaigns"
          title="Join a campaign to play a shared session"
          className={BANNER_CHIP}
        >
          Join a campaign
        </Link>
      )}
      {/* Cmd/Ctrl+J quick-capture. */}
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
        <button
          type="button"
          disabled={sessionActionBusy}
          onClick={onLeaveSession}
          className={BANNER_CHIP}
        >
          Leave Session
        </button>
      )}
      {isLiveJoined && onEndSession && (
        <button
          type="button"
          disabled={sessionActionBusy}
          onClick={onEndSession}
          className={BANNER_CHIP_SOLID}
        >
          End Session
        </button>
      )}
      <OverflowMenu
        label="Sheet actions"
        triggerClassName={BANNER_KEBAB}
        items={[{ label: "Delete", onSelect: onOpenDelete, danger: true }]}
      />
    </div>
  );
}
