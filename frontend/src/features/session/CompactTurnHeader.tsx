/**
 * CompactTurnHeader — the slim mobile header shown in place of SessionTopBar
 * during the player's active turn (#746). Trims the top bar to a single row:
 * back chevron + character identity + a Round chip, with the Note / Leave / End
 * controls collapsed into the shared OverflowMenu. Mobile-only; the full
 * SessionTopBar returns at md+ and between turns (gated by SessionContent).
 */

import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import OverflowMenu from "@/components/ui/OverflowMenu";
import type { Character } from "@/types/character";

interface CompactTurnHeaderProps {
  character: Character;
  /** turnState.round — the header only renders on the active turn, so this is ≥ 1. */
  round: number;
  /** A leave is in flight — disables the Leave/End menu items (parity with SessionTopBar). */
  leavePending: boolean;
  /** An end-session is in flight — disables the Leave/End menu items. */
  endPending: boolean;
  leaveError: string | null;
  onCapture: () => void;
  onLeave: () => void;
  onEndClick: () => void;
}

export default function CompactTurnHeader({
  character,
  round,
  leavePending,
  endPending,
  leaveError,
  onCapture,
  onLeave,
  onEndClick,
}: CompactTurnHeaderProps) {
  const controlsBusy = endPending || leavePending;
  return (
    <div className="border-b border-parchment-200 bg-parchment-50">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2.5">
        <Link
          to={`/characters/${character.id}`}
          aria-label="Back to character sheet"
          className="shrink-0 text-lg leading-none text-garnet-700 hover:text-garnet-800"
        >
          <span aria-hidden="true">‹</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold leading-tight text-parchment-900">
            {character.name}
          </h1>
          <p className="truncate text-xs text-parchment-600">
            {character.race} {character.class}
            {character.subclass ? ` (${character.subclass})` : ""} · Level {character.level}
          </p>
        </div>
        <Badge tone="garnet" className="shrink-0">
          Round {round}
        </Badge>
        <OverflowMenu
          label="Session actions"
          className="shrink-0"
          items={[
            { label: "＋ Note", onSelect: onCapture },
            { label: "Leave Session", onSelect: onLeave, disabled: controlsBusy },
            {
              label: "End Session",
              onSelect: onEndClick,
              danger: true,
              separatorBefore: true,
              disabled: controlsBusy,
            },
          ]}
        />
      </div>
      {leaveError && (
        <p className="mx-auto max-w-4xl px-4 pb-2 text-xs text-garnet-700">{leaveError}</p>
      )}
    </div>
  );
}
