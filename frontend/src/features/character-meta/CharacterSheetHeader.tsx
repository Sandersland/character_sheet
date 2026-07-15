import { Link } from "react-router-dom";

import BackendStatus from "@/features/character-meta/BackendStatus";
import BannerVitals from "@/features/character-meta/BannerVitals";
import CampaignIndicator from "@/features/campaign/CampaignIndicator";
import Tabs from "@/components/ui/Tabs";
import { classSummary } from "@/lib/multiclass";
import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";
import type { useSessionButton } from "@/features/session/useSessionButton";
import type { Character } from "@/types/character";

interface CharacterSheetHeaderProps {
  character: Character;
  session: ReturnType<typeof useSessionButton>;
  tabs: SheetTab[];
  activeTab: SheetTabId;
  onTabChange: (id: SheetTabId) => void;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
}

/**
 * The persistent sheet banner: identity + always-on vitals + the workspace tab
 * bar, all on the garnet field. It stays put while the tab panels swap below it,
 * so vitals and abilities are never more than a glance away (the "1d / Codex"
 * direction — see epic #921).
 */
export default function CharacterSheetHeader({
  character,
  session,
  tabs,
  activeTab,
  onTabChange,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: CharacterSheetHeaderProps) {
  return (
    <header className="bg-gradient-to-br from-garnet-800 via-garnet-700 to-garnet-900 text-parchment-50">
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
            <div className="flex flex-wrap items-center justify-end gap-3">
              {/* Session button: campaign-required; sessions are shared per campaign. */}
              {session.hasCampaign ? (
                <button
                  type="button"
                  disabled={session.sessionPending || !session.sessionReady}
                  onClick={session.handleSessionButton}
                  className="rounded-control bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-garnet-800 transition-colors hover:bg-parchment-100 disabled:opacity-50"
                >
                  {session.sessionLabel}
                </button>
              ) : (
                <Link
                  to="/campaigns"
                  title="Join a campaign to play a shared session"
                  className="rounded-control border border-parchment-50/60 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-white/10"
                >
                  Join a campaign
                </Link>
              )}
              {/* Cmd/Ctrl+J quick-capture; this button is the touch-discoverable affordance. */}
              <button
                type="button"
                onClick={onOpenCapture}
                className="rounded-control border border-parchment-50/60 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-white/10"
              >
                ＋ Note
              </button>
              <button
                type="button"
                onClick={onOpenSessions}
                className="text-xs font-semibold text-garnet-100 transition-colors hover:text-parchment-50"
              >
                Sessions
              </button>
              <button
                type="button"
                onClick={onOpenActivity}
                className="text-xs font-semibold text-garnet-100 transition-colors hover:text-parchment-50"
              >
                Activity
              </button>
              <button
                type="button"
                onClick={onOpenDelete}
                className="text-xs font-semibold text-garnet-100 transition-colors hover:text-parchment-50"
              >
                Delete
              </button>
            </div>
            {session.sessionError && (
              <p className="text-xs font-semibold text-garnet-100">{session.sessionError}</p>
            )}
          </div>
        </div>

        {/* Always-on vitals */}
        <div className="mt-4">
          <BannerVitals character={character} />
        </div>

        {/* Workspace tab bar */}
        <div className="mt-4 pb-4">
          <Tabs
            tabs={tabs}
            active={activeTab}
            onChange={(id) => onTabChange(id as SheetTabId)}
            idBase="sheet"
          />
        </div>
      </div>
    </header>
  );
}
