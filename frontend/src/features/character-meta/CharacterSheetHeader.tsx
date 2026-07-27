import { useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import BackendStatus from "@/features/character-meta/BackendStatus";
import BannerVitals from "@/features/character-meta/BannerVitals";
import MobileSheetHeader from "@/features/character-meta/MobileSheetHeader";
import CampaignIndicator from "@/features/campaign/CampaignIndicator";
import OverflowMenu from "@/components/ui/OverflowMenu";
import PreferencesSheet from "@/features/preferences/PreferencesSheet";
import Tabs from "@/components/ui/Tabs";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { EDITION_LABELS } from "@/lib/editionCopy";
import { classSummary } from "@/lib/multiclass";
import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";

interface CharacterSheetHeaderProps {
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
  /** Opens the Campaign settings sheet (#1087); the ⋮ item shows only when set
   *  AND the character is campaign-attached. */
  onOpenCampaignSettings?: () => void;
}

/** The mobile header's folded-in Leave/End controls (#979), present only while
 *  this character is in a live session. Extracted so the header render stays
 *  under the cognitive ceiling. onLeave is optional — a solo session (#1082)
 *  omits it (Leave is campaign-only), so the group hinges on End, not Leave. */
function buildSessionActions(
  isLiveJoined: boolean,
  busy: boolean,
  onLeave?: () => void,
  onEnd?: () => void,
): { busy: boolean; onLeave?: () => void; onEnd: () => void } | null {
  if (!isLiveJoined || !onEnd) return null;
  return { busy, onLeave, onEnd };
}

/** Gate the Campaign-settings ⋮ item once (#1087): only campaign-attached
 *  characters with a wired handler get it. Extracted so both breakpoints agree
 *  and the header component stays under the cognitive ceiling. */
function campaignSettingsHandler(
  campaignId: string | undefined,
  onOpen?: () => void,
): (() => void) | undefined {
  return campaignId ? onOpen : undefined;
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
  onOpenCampaignSettings,
}: CharacterSheetHeaderProps) {
  const { character } = useCurrentCharacter();
  const campaignSettings = campaignSettingsHandler(character.campaignId, onOpenCampaignSettings);
  return (
    <>
      {/* Mobile: compact sticky mini-header. Desktop: the garnet banner below. */}
      <MobileSheetHeader
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
        onOpenCampaignSettings={campaignSettings}
      />
      <DesktopBanner
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
        onOpenCampaignSettings={campaignSettings}
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
  onOpenCampaignSettings,
}: Omit<CharacterSheetHeaderProps, "scrolled" | "onGoToCombat">) {
  const { character } = useCurrentCharacter();
  // Desktop tab bar mirrors the mobile nav pip: a gold dot on Combat while live.
  const bannerTabs = withCombatLivePip(tabs, isLive);
  return (
    <header className="hidden border-b border-parchment-200 bg-parchment-50 text-parchment-900 md:block">
      {/* Thin garnet top rule — the one saturated accent on the light surface.
          garnet-surface-deep/-surface (#994), not the inverting ramp: via-garnet-600
          would leave a pale-salmon core in dark mode, a half-migrated rule. */}
      <div
        aria-hidden
        className="h-[5px] bg-gradient-to-r from-garnet-surface-deep via-garnet-surface to-garnet-surface-deep"
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
                {/* Sheet header + campaign header only (#1286) — not the character-list card. */}
                <Badge tone="neutral">{EDITION_LABELS[character.rulesEdition]}</Badge>
                <CampaignIndicator />
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <BackendStatus />
            <BannerActions
              uncampaigned={!character.campaignId}
              campaignId={character.campaignId}
              isLive={isLive}
              liveRound={liveRound}
              isLiveJoined={isLiveJoined}
              sessionActionBusy={sessionActionBusy}
              onOpenCapture={onOpenCapture}
              onOpenSessions={onOpenSessions}
              onOpenActivity={onOpenActivity}
              onOpenDelete={onOpenDelete}
              onOpenCampaignSettings={onOpenCampaignSettings}
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
          <BannerVitals />
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

/** Pure kebab item-list builder (#1167), mirrors MobileSheetHeader's buildMenuItems.
 *  Delete always gets separatorBefore: with Preferences always present above it, a
 *  bare Delete never sits alone. Extracted (like campaignSettingsHandler above) so
 *  BannerSheetActions stays under the complexity ceiling. */
function buildBannerMenuItems(
  onOpenPreferences: () => void,
  onOpenDelete: () => void,
  onOpenCampaignSettings?: () => void,
): { label: string; onSelect: () => void; danger?: boolean; separatorBefore?: boolean }[] {
  return [
    { label: "Preferences…", onSelect: onOpenPreferences },
    ...(onOpenCampaignSettings
      ? [{ label: "Campaign settings…", onSelect: onOpenCampaignSettings }]
      : []),
    { label: "Delete", onSelect: onOpenDelete, danger: true, separatorBefore: true },
  ];
}

/** The desktop kebab + its own PreferencesSheet mount, split out of BannerActions
 *  (#1167) so this state/branching doesn't inflate that component's complexity.
 *  Same desktop entry into PreferencesSheet as the mobile ⋯ menu, so a
 *  campaign-attached character gets a working "Campaign settings →" cross-link
 *  here too, not only on mobile. */
function BannerSheetActions({
  campaignId,
  onOpenDelete,
  onOpenCampaignSettings,
}: {
  campaignId?: string;
  onOpenDelete: () => void;
  onOpenCampaignSettings?: () => void;
}) {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const menuItems = buildBannerMenuItems(() => setPrefsOpen(true), onOpenDelete, onOpenCampaignSettings);
  return (
    <>
      <OverflowMenu label="Sheet actions" triggerClassName={BANNER_KEBAB} items={menuItems} />
      {prefsOpen && (
        <PreferencesSheet
          onClose={() => setPrefsOpen(false)}
          campaignId={campaignId}
          onOpenCampaignSettings={onOpenCampaignSettings}
        />
      )}
    </>
  );
}

/** The desktop banner's right-hand action cluster (#985/#1085) — the sole live
 *  indicator now the under-tabs strip is gone: a `Live · Round N` pill + ＋ Note,
 *  plus Leave/End Session while joined. Delete is demoted behind the ⋯ overflow so
 *  it never sits next to End session. */
function BannerActions({
  uncampaigned,
  campaignId,
  isLive,
  liveRound,
  isLiveJoined,
  sessionActionBusy,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
  onOpenCampaignSettings,
  onLeaveSession,
  onEndSession,
}: {
  uncampaigned: boolean;
  campaignId?: string;
  isLive: boolean;
  liveRound: number | null;
  isLiveJoined: boolean;
  sessionActionBusy: boolean;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
  onOpenCampaignSettings?: () => void;
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
      <BannerSheetActions
        campaignId={campaignId}
        onOpenDelete={onOpenDelete}
        onOpenCampaignSettings={onOpenCampaignSettings}
      />
    </div>
  );
}
