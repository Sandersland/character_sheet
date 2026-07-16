import { Link } from "react-router-dom";

import MeterBar from "@/components/ui/MeterBar";
import OverflowMenu from "@/components/ui/OverflowMenu";
import Popover from "@/components/ui/Popover";
import RollButton from "@/features/dice/RollButton";
import { formatModifier } from "@/lib/abilities";
import { classSummary, isMulticlass } from "@/lib/multiclass";
import type { Character } from "@/types/character";

interface MobileSheetHeaderProps {
  character: Character;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
}

// Shared compact vital-tile shell — border, tint, centered label/value column.
const TILE =
  "flex flex-col items-center justify-center rounded-control border border-parchment-200 bg-parchment-100 px-1 py-1.5";
const TILE_VALUE = "font-display text-base font-semibold leading-none text-garnet-800";
const TILE_LABEL = "mt-1 text-[9px] font-semibold uppercase tracking-wide text-parchment-600";

/**
 * Mobile-only (`md:hidden`) sticky mini-header — the phone counterpart to the
 * desktop garnet banner. A light parchment strip with identity, a read-only HP
 * meter, and the four always-on vitals, keeping the sheet's own scroll room
 * instead of the banner's ~55% viewport (redesign fix). HP edits stay on the
 * Combat tab; the row actions collapse to the session pill + an overflow menu.
 */
export default function MobileSheetHeader({
  character,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
}: MobileSheetHeaderProps) {
  const { current, max, temp } = character.hitPoints;

  // "Race · Class Level" — classSummary carries per-class levels for multiclass;
  // single-class shows its own level (subclass moves to the trailing pill).
  const multiclass = isMulticlass(character.classes);
  const classLine = multiclass
    ? classSummary(character.classes, { name: character.class })
    : `${character.class} ${character.level}`;
  // Pill carries new info: subclass for single-class; for multiclass the
  // subclasses already ride in classLine, so show the level instead.
  const pill = !multiclass && character.subclass ? character.subclass : `Lvl ${character.level}`;

  return (
    <header className="z-30 shrink-0 border-b border-parchment-200 bg-parchment-50 px-3 py-2.5 shadow-sm md:hidden">
      {/* Row 1: identity + collapsed actions */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control bg-gradient-to-br from-garnet-700 to-garnet-900 font-display text-lg font-semibold text-parchment-50 shadow-raised">
          {character.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold leading-tight text-garnet-800">
            {character.name}
          </h1>
          <p className="truncate text-xs text-parchment-600">
            {character.race} · {classLine}
          </p>
        </div>
        <span className="flex-none rounded-full bg-garnet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-garnet-700">
          {pill}
        </span>
        {/* Start/join/resume moved to the SessionDoorway bar above the nav (#942).
            Campaign-less characters have no doorway, so keep the Join-campaign
            invite here. */}
        {!character.campaignId && (
          <Link
            to="/campaigns"
            title="Join a campaign to play a shared session"
            className="flex-none rounded-control border border-parchment-300 px-2.5 py-1 text-[11px] font-semibold text-garnet-700 transition-colors hover:bg-parchment-100"
          >
            Join campaign
          </Link>
        )}
        <OverflowMenu
          label="Sheet actions"
          items={[
            { label: "＋ Note", onSelect: onOpenCapture },
            { label: "Sessions", onSelect: onOpenSessions },
            { label: "Activity", onSelect: onOpenActivity },
            { label: "Delete", onSelect: onOpenDelete, danger: true, separatorBefore: true },
          ]}
        />
      </div>

      {/* HP: read-only readout + meter (editing lives on the Combat tab). */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-parchment-600">
          HP
        </span>
        <span className="flex-none font-display text-sm font-semibold text-garnet-800">
          {current}
          <span className="text-parchment-600">/{max}</span>
          {temp > 0 && <span className="text-arcane-700"> +{temp}</span>}
        </span>
        <div className="flex-1">
          <MeterBar current={current} max={max} tone="vitality" label={`Hit points ${current} of ${max}`} />
        </div>
      </div>

      {/* Vitals: AC · Init · Speed · Prof, one equal-width row. */}
      <div className="mt-2 flex gap-1.5">
        <Popover
          label="Armor Class breakdown"
          className="flex-1"
          triggerClassName={`${TILE} w-full focus-visible:ring-2 focus-visible:ring-garnet-600`}
          trigger={
            <>
              <span className={TILE_VALUE}>{character.armorClass}</span>
              <span className={TILE_LABEL}>AC</span>
            </>
          }
        >
          <dl className="px-3 py-2 text-sm">
            {character.armorClassBreakdown.map((part, i) => (
              <div key={`${part.label}-${i}`} className="flex items-center justify-between gap-4 py-0.5">
                <dt className="text-parchment-700">{part.label}</dt>
                <dd className="font-semibold tabular-nums text-parchment-900">
                  {/* deriveArmorClassParts always emits the base (armor/unarmored) part first. */}
                  {i === 0 ? part.value : formatModifier(part.value)}
                </dd>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between gap-4 border-t border-parchment-200 pt-1">
              <dt className="font-semibold text-parchment-800">Total</dt>
              <dd className="font-semibold tabular-nums text-parchment-900">{character.armorClass}</dd>
            </div>
          </dl>
        </Popover>

        <RollButton
          spec={{ count: 1, faces: 20, modifier: character.initiativeBonus }}
          label="Initiative"
          log={{ kind: "initiative", source: "Initiative" }}
          className={`${TILE} flex-1`}
        >
          <span className={TILE_VALUE}>{formatModifier(character.initiativeBonus)}</span>
          <span className={TILE_LABEL}>Init</span>
        </RollButton>

        <div className={`${TILE} flex-1`}>
          <span className={TILE_VALUE}>{character.speed}</span>
          <span className={TILE_LABEL}>Speed</span>
        </div>

        <div className={`${TILE} flex-1`}>
          <span className={TILE_VALUE}>{formatModifier(character.proficiencyBonus)}</span>
          <span className={TILE_LABEL}>Prof</span>
        </div>
      </div>
    </header>
  );
}
