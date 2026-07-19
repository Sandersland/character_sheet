import { ChevronDown, Shield } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import MeterBar from "@/components/ui/MeterBar";
import OverflowMenu from "@/components/ui/OverflowMenu";
import Popover from "@/components/ui/Popover";
import ArmorClassBreakdown from "@/features/character-meta/ArmorClassBreakdown";
import CharacterSwitcherSheet from "@/features/character-meta/CharacterSwitcherSheet";
import ManageHpButton from "@/features/hitpoints/ManageHpButton";
import { classSummary, isMulticlass } from "@/lib/multiclass";
import type { Character } from "@/types/character";

type SheetMenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; separatorBefore?: boolean };

// Shared shape for the two breakpoint sub-headers (CollapsedBar / ExpandedSheetHeader):
// identity + HP readout + the live pill + the "Sheet actions" ⋯ menu.
interface SubHeaderProps {
  character: Character;
  onUpdate?: (character: Character) => void;
  pill: React.ReactNode;
  menuItems: SheetMenuItem[];
  onOpenSwitcher: () => void;
}

interface MobileSheetHeaderProps {
  character: Character;
  /** Opens the shared HP sheet from the HP readout; omit for a read-only row. */
  onUpdate?: (character: Character) => void;
  /** Live-session controls folded into the "Sheet actions" menu while joined
   *  (#979). Non-null ⇒ a session is live and this character is in it. */
  sessionActions?: { busy: boolean; onLeave: () => void; onEnd: () => void } | null;
  /** Active combat round for the live pill (null → "Live"). */
  liveRound?: number | null;
  /** Jump to the Combat tab — the live pill's tap target (#1026). */
  onGoToCombat?: () => void;
  /** The sheet's scroll region has scrolled past the top; collapses the header to
   *  a single bar (#1026). */
  scrolled?: boolean;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
  /** Opens the Campaign settings sheet (#1087); the ⋮ item shows only when the
   *  caller passes a handler (gated on campaign attachment upstream). */
  onOpenCampaignSettings?: () => void;
}

/** Pulsing garnet live pill — the single live-state indicator (#1026), replacing
 *  the full-width "Session live" banner. Tapping it jumps to the Combat tab. */
function LivePill({ round, onGoToCombat }: { round: number | null; onGoToCombat?: () => void }) {
  const state = round != null ? `Round ${round}` : "Live";
  return (
    <button
      type="button"
      onClick={onGoToCombat}
      aria-label={`${state} — go to fight`}
      className="flex flex-none items-center gap-1.5 rounded-full bg-garnet-800 px-2.5 py-1 text-[11px] font-bold text-parchment-50 transition-colors hover:bg-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-vitality-400 motion-safe:animate-pulse" />
      {state}
    </button>
  );
}

/** Compact bordered AC badge (shield glyph + derived AC) that opens the AC
 *  breakdown. Reads `character.armorClass`, so equipping armor updates it live. */
function AcBadge({ character }: { character: Character }) {
  return (
    <Popover
      label="Armor Class breakdown"
      align="right"
      triggerClassName="flex flex-none items-center gap-1 rounded-full border border-parchment-200 bg-parchment-50 py-1 pl-2 pr-2.5 text-[13px] font-bold tabular-nums text-parchment-900"
      trigger={
        <>
          <Shield className="h-3.5 w-3.5 text-parchment-600" aria-hidden />
          {character.armorClass}
        </>
      }
    >
      <ArmorClassBreakdown character={character} />
    </Popover>
  );
}

// The HP numbers (current/max/temp) — tabular so the meter edge stays put.
function HpNumbers({ current, max, temp }: { current: number; max: number; temp: number }) {
  return (
    <span className="flex-none font-display text-sm font-semibold tabular-nums text-garnet-800">
      {current}
      <span className="font-normal text-parchment-600">/{max}</span>
      {temp > 0 && <span className="text-arcane-700"> +{temp}</span>}
    </span>
  );
}

// One menu, not two (#979): while joined, Leave/End Session join Note/Sessions/
// Activity/All characters (above Delete). "All characters" (#1027) is the ⋮
// discoverability fallback for the identity-tap switcher.
function buildMenuItems(
  handlers: Pick<MobileSheetHeaderProps, "onOpenCapture" | "onOpenSessions" | "onOpenActivity" | "onOpenDelete" | "onOpenCampaignSettings">,
  onAllCharacters: () => void,
  sessionActions: MobileSheetHeaderProps["sessionActions"],
): SheetMenuItem[] {
  return [
    { label: "＋ Note", onSelect: handlers.onOpenCapture },
    { label: "Sessions", onSelect: handlers.onOpenSessions },
    { label: "Activity", onSelect: handlers.onOpenActivity },
    ...(handlers.onOpenCampaignSettings
      ? [{ label: "Campaign settings…", onSelect: handlers.onOpenCampaignSettings }]
      : []),
    { label: "All characters", onSelect: onAllCharacters, separatorBefore: true },
    ...(sessionActions
      ? [
          { label: "Leave Session", onSelect: sessionActions.onLeave, disabled: sessionActions.busy, separatorBefore: true },
          { label: "End Session", onSelect: sessionActions.onEnd, disabled: sessionActions.busy },
        ]
      : []),
    { label: "Delete", onSelect: handlers.onOpenDelete, danger: true, separatorBefore: true },
  ];
}

/**
 * Mobile-only (`md:hidden`) sticky mini-header — the phone counterpart to the
 * desktop garnet banner. A compact two-row strip: identity + live pill on row 1,
 * HP meter + AC badge on row 2 (#1026). Scrolling the sheet collapses it to a
 * single {@link CollapsedBar}. In both states the identity block is a button
 * opening the {@link CharacterSwitcherSheet} — the mobile route back out (#1027).
 */
export default function MobileSheetHeader({
  character,
  onUpdate,
  sessionActions = null,
  liveRound = null,
  onGoToCombat,
  scrolled = false,
  onOpenCapture,
  onOpenSessions,
  onOpenActivity,
  onOpenDelete,
  onOpenCampaignSettings,
}: MobileSheetHeaderProps) {
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const menuItems = buildMenuItems(
    { onOpenCapture, onOpenSessions, onOpenActivity, onOpenDelete, onOpenCampaignSettings },
    () => navigate("/"),
    sessionActions,
  );
  const live = sessionActions !== null;
  const pill = live ? <LivePill round={liveRound} onGoToCombat={onGoToCombat} /> : null;
  const openSwitcher = () => setSwitcherOpen(true);

  return (
    <>
      {scrolled ? (
        <CollapsedBar character={character} onUpdate={onUpdate} pill={pill} menuItems={menuItems} onOpenSwitcher={openSwitcher} />
      ) : (
        <ExpandedSheetHeader character={character} onUpdate={onUpdate} pill={pill} menuItems={menuItems} onOpenSwitcher={openSwitcher} />
      )}
      {switcherOpen && <CharacterSwitcherSheet currentId={character.id} onClose={() => setSwitcherOpen(false)} />}
    </>
  );
}

/**
 * The collapsed one-line bar (#1026): avatar · name · HP + mini meter · live pill
 * · ⋯. The scroll-collapsed default — calm paper chrome so the panel below stays
 * the subject. Tapping the identity region opens the character switcher (#1027).
 */
function CollapsedBar({ character, onUpdate, pill, menuItems, onOpenSwitcher }: SubHeaderProps) {
  const { current, max, temp } = character.hitPoints;
  const hp = (
    <>
      <HpNumbers current={current} max={max} temp={temp} />
      <span className="w-16">
        <MeterBar current={current} max={max} tone="vitality" label={`Hit points ${current} of ${max}`} />
      </span>
    </>
  );
  return (
    <header className="z-30 flex shrink-0 items-center gap-2 border-b border-parchment-200 bg-parchment-50 px-4 py-2 shadow-sm md:hidden">
      {/* Identity — opens the switcher (avatar + name + caret). */}
      <button
        type="button"
        onClick={onOpenSwitcher}
        aria-label="Switch character"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-control bg-gradient-to-br from-garnet-700 to-garnet-900 font-display text-sm font-semibold text-parchment-50 shadow-raised">
          {character.name.charAt(0)}
        </span>
        <span className="truncate font-display text-[15px] font-semibold leading-tight text-garnet-800">
          {character.name}
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-none text-parchment-400" aria-hidden />
      </button>

      {/* HP — its own tap target (#982): opens the shared "Hit Points" sheet. */}
      {onUpdate ? (
        <ManageHpButton
          character={character}
          onUpdate={onUpdate}
          className="flex flex-none items-center gap-1.5 rounded-control px-1 py-0.5 transition-colors hover:bg-parchment-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
        >
          {hp}
        </ManageHpButton>
      ) : (
        <div className="flex flex-none items-center gap-1.5">{hp}</div>
      )}

      {pill}
      <OverflowMenu label="Sheet actions" items={menuItems} />
    </header>
  );
}

/**
 * The full (expanded) two-row header (#1026). Row 1: avatar + identity + caret +
 * live pill + ⋯. Row 2: HP numbers + full-width meter + AC badge. The identity
 * (avatar + name + subtitle) is a button opening the character switcher (#1027).
 */
function ExpandedSheetHeader({ character, onUpdate, pill, menuItems, onOpenSwitcher }: SubHeaderProps) {
  const { current, max, temp } = character.hitPoints;

  // "Race · Class Level" — classSummary carries per-class levels for multiclass;
  // single-class shows its own level (subclass moves to the trailing pill).
  const multiclass = isMulticlass(character.classes);
  const classLine = multiclass
    ? classSummary(character.classes, { name: character.class })
    : `${character.class} ${character.level}`;
  // Pill carries new info: subclass for single-class; for multiclass the
  // subclasses already ride in classLine, so show the level instead.
  const levelPill = !multiclass && character.subclass ? character.subclass : `Lvl ${character.level}`;

  return (
    <header className="z-30 shrink-0 border-b border-parchment-200 bg-parchment-50 px-4 py-2.5 shadow-sm md:hidden">
      {/* Row 1: identity (switcher trigger) + live pill + actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSwitcher}
          aria-label="Switch character"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
        >
          <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control bg-gradient-to-br from-garnet-700 to-garnet-900 font-display text-lg font-semibold text-parchment-50 shadow-raised">
            {character.name.charAt(0)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="truncate font-display text-lg font-semibold leading-tight text-garnet-800">
                {character.name}
              </span>
              <ChevronDown className="h-3.5 w-3.5 flex-none text-parchment-400" aria-hidden />
            </span>
            <span className="block truncate text-xs text-parchment-600">
              {character.race} · {classLine}
            </span>
          </span>
        </button>
        <span className="flex-none rounded-full bg-garnet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-garnet-700">
          {levelPill}
        </span>
        {pill}
        {/* Campaign-less characters have no doorway, so keep the Join invite here. */}
        {!character.campaignId && (
          <Link
            to="/campaigns"
            title="Join a campaign to play a shared session"
            className="flex-none rounded-control border border-parchment-300 px-2.5 py-1 text-[11px] font-semibold text-garnet-700 transition-colors hover:bg-parchment-100"
          >
            Join campaign
          </Link>
        )}
        <OverflowMenu label="Sheet actions" items={menuItems} />
      </div>

      {/* Row 2: HP numbers + full-width meter + AC badge. HP taps through to the
          shared "Hit Points" sheet (#982); read-only readout without onUpdate. */}
      <div className="mt-2 flex items-center gap-2.5">
        {onUpdate ? (
          <ManageHpButton
            character={character}
            onUpdate={onUpdate}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1 py-0.5 text-left transition-colors hover:bg-parchment-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
          >
            <HpNumbers current={current} max={max} temp={temp} />
            <span className="min-w-0 flex-1">
              <MeterBar current={current} max={max} tone="vitality" label={`Hit points ${current} of ${max}`} />
            </span>
          </ManageHpButton>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <HpNumbers current={current} max={max} temp={temp} />
            <span className="min-w-0 flex-1">
              <MeterBar current={current} max={max} tone="vitality" label={`Hit points ${current} of ${max}`} />
            </span>
          </div>
        )}
        <AcBadge character={character} />
      </div>
    </header>
  );
}
