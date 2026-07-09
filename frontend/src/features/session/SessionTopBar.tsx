/**
 * SessionTopBar — the SessionPage title bar: back link, character identity, and
 * (via SessionHeaderControls) the status + Note / Leave / End Session controls.
 */

import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import SessionHeaderControls from "@/features/session/SessionHeaderControls";
import type { Character, Session } from "@/types/character";

interface SessionTopBarProps {
  character: Character;
  session: Session;
  leavePending: boolean;
  endPending: boolean;
  leaveError: string | null;
  onCapture: () => void;
  onLeave: () => void;
  onEndClick: () => void;
}

export default function SessionTopBar({
  character,
  session,
  leavePending,
  endPending,
  leaveError,
  onCapture,
  onLeave,
  onEndClick,
}: SessionTopBarProps) {
  return (
    <div className="border-b border-parchment-200 bg-parchment-50">
      <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Link
            to={`/characters/${character.id}`}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            ← Character sheet
          </Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-parchment-900">
            {character.name}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-parchment-600">
            <span>
              {character.race} {character.class}
              {character.subclass ? ` (${character.subclass})` : ""}
            </span>
            <Badge tone="garnet">Level {character.level}</Badge>
            {session.title && <span className="italic">{session.title}</span>}
          </p>
        </div>
        <SessionHeaderControls
          controlsBusy={endPending || leavePending}
          leaveError={leaveError}
          onCapture={onCapture}
          onLeave={onLeave}
          onEndClick={onEndClick}
        />
      </div>
    </div>
  );
}
