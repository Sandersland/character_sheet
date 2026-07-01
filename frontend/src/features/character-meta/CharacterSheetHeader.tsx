import { Link } from "react-router-dom";

import BackendStatus from "@/features/character-meta/BackendStatus";
import CampaignIndicator from "@/features/campaign/CampaignIndicator";
import Badge from "@/components/ui/Badge";
import type { useSessionButton } from "@/features/session/useSessionButton";
import type { Character } from "@/types/character";

interface CharacterSheetHeaderProps {
  character: Character;
  session: ReturnType<typeof useSessionButton>;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
}

export default function CharacterSheetHeader({
  character,
  session,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: CharacterSheetHeaderProps) {
  return (
    <div className="border-b border-parchment-200 bg-parchment-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div>
          <Link
            to="/"
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            ← All characters
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold text-parchment-900">
            {character.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-parchment-600">
            <span>
              {character.race} {character.class}
              {character.subclass ? ` (${character.subclass})` : ""}
            </span>
            <Badge tone="garnet">Level {character.level}</Badge>
            <span className="text-parchment-600">
              {character.background} · {character.alignment}
            </span>
            <CampaignIndicator character={character} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BackendStatus />
          <div className="flex flex-wrap items-center gap-3">
            {/* Session button: campaign-required; sessions are shared per campaign, not per character. */}
            {session.hasCampaign ? (
              <button
                type="button"
                disabled={session.sessionPending || !session.sessionReady}
                onClick={session.handleSessionButton}
                className="rounded-control bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
              >
                {session.sessionLabel}
              </button>
            ) : (
              <Link
                to="/campaigns"
                title="Join a campaign to play a shared session"
                className="rounded-control border border-garnet-700 px-3 py-1.5 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-50"
              >
                Join a campaign
              </Link>
            )}
            {/* Cmd/Ctrl+J quick-capture; this button is the touch-discoverable affordance. */}
            <button
              type="button"
              onClick={onOpenCapture}
              className="rounded-control border border-arcane-700 px-3 py-1.5 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-50"
            >
              ＋ Note
            </button>
            <button
              type="button"
              onClick={onOpenSessions}
              className="text-xs font-semibold text-arcane-700 hover:underline"
            >
              Sessions
            </button>
            <button
              type="button"
              onClick={onOpenActivity}
              className="text-xs font-semibold text-arcane-700 hover:underline"
            >
              Activity
            </button>
            <button
              type="button"
              onClick={onOpenDelete}
              className="text-xs font-semibold text-garnet-700 hover:underline"
            >
              Delete
            </button>
          </div>
          {session.sessionError && (
            <p className="text-xs font-semibold text-garnet-700">{session.sessionError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
