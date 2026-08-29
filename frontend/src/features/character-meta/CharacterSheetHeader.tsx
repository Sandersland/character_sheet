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
import { classSummary } from "@/lib/multiclass";
import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";

interface CharacterSheetHeaderProps {
  tabs: SheetTab[];
  activeTab: SheetTabId;
  onTabChange: (id: SheetTabId) => void;
  isLive?: boolean;
  /** null = live but not in combat, or not joined. */
  liveRound?: number | null;
  isLiveJoined?: boolean;
  sessionActionBusy?: boolean;
  onLeaveSession?: () => void;
  onEndSession?: () => void;
  scrolled?: boolean;
  onGoToCombat?: () => void;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
  /** Gated by campaignSettingsHandler — shows only when set AND the character is campaign-attached. */
  onOpenCampaignSettings?: () => void;
}

/** onLeave is optional (solo sessions omit it, #1082 — Leave is campaign-only),
 *  so presence hinges on onEnd, not onLeave. */
function buildSessionActions(
  isLiveJoined: boolean,
  busy: boolean,
  onLeave?: () => void,
  onEnd?: () => void,
): { busy: boolean; onLeave?: () => void; onEnd: () => void } | null {
  if (!isLiveJoined || !onEnd) return null;
  return { busy, onLeave, onEnd };
}

// Shared by both breakpoints so the gate can't diverge between them.
function campaignSettingsHandler(
  campaignId: string | undefined,
  onOpen?: () => void,
): (() => void) | undefined {
  return campaignId ? onOpen : undefined;
}

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
  const bannerTabs = withCombatLivePip(tabs, isLive);
  return (
    <header className="hidden border-b border-parchment-200 bg-parchment-50 text-parchment-900 md:block">
      {/* garnet-surface-deep/-surface, not the inverting ramp — via-garnet-600 leaves a pale-salmon core in dark mode. */}
      <div
        aria-hidden
        className="h-[5px] bg-gradient-to-r from-garnet-surface-deep via-garnet-surface to-garnet-surface-deep"
      />
      <div className="mx-auto max-w-6xl px-6 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            
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
                {/* rulesEditionLabel is served with the sheet (#1436) — no /api/editions round-trip, never an empty first paint. */}
                <Badge tone="neutral">{character.rulesEditionLabel}</Badge>
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

const BANNER_CHIP =
  "rounded-control border border-parchment-300 px-3 py-1.5 text-xs font-semibold text-parchment-800 transition-colors hover:bg-parchment-100 disabled:opacity-50";
const BANNER_CHIP_SOLID =
  "rounded-control bg-garnet-soft-surface px-3 py-1.5 text-xs font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover disabled:opacity-50";
const BANNER_LINK =
  "text-xs font-semibold text-garnet-700 transition-colors hover:text-garnet-900 disabled:opacity-50";
const BANNER_KEBAB =
  "flex h-7 w-7 items-center justify-center rounded-control text-parchment-700 transition-colors hover:bg-parchment-100 hover:text-parchment-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";

// Mirrors MobileSheetHeader's buildMenuItems — keep the two in sync.
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
        <span className="rounded-full bg-garnet-soft-surface px-3 py-1 text-xs font-bold text-garnet-on-surface">
          {liveRound != null ? `Live · Round ${liveRound}` : "Live"}
        </span>
      )}
      
      {uncampaigned && (
        <Link
          to="/campaigns"
          title="Join a campaign to play a shared session"
          className={BANNER_CHIP}
        >
          Join a campaign
        </Link>
      )}
      
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
