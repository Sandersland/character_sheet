import { ChevronDown, Shield } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import MeterBar from "@/components/ui/MeterBar";
import OverflowMenu from "@/components/ui/OverflowMenu";
import Popover from "@/components/ui/Popover";
import ArmorClassBreakdown from "@/features/character-meta/ArmorClassBreakdown";
import CharacterSwitcherSheet from "@/features/character-meta/CharacterSwitcherSheet";
import ManageHpButton from "@/features/hitpoints/ManageHpButton";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { classSummary, isMulticlass } from "@/lib/multiclass";
import type { Character } from "@/types/character";

type HeaderVariant = "expanded" | "collapsed";

type SheetMenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; separatorBefore?: boolean };

interface MobileSheetHeaderProps {
  character: Character;
  /** Opens the shared HP sheet from the HP readout; omit for a read-only row. */
  onUpdate?: (character: Character) => void;
  /** Live-session controls folded into the "Sheet actions" menu while joined
   *  (#979). Non-null ⇒ a session is live and this character is in it. onLeave is
   *  omitted for a solo session (#1082) — Leave is campaign-only, End is not. */
  sessionActions?: { busy: boolean; onLeave?: () => void; onEnd: () => void } | null;
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
  handlers: Pick<MobileSheetHeaderProps, "onOpenCapture" | "onOpenSessions" | "onOpenActivity" | "onOpenDelete">,
  onAllCharacters: () => void,
  sessionActions: MobileSheetHeaderProps["sessionActions"],
): SheetMenuItem[] {
  return [
    { label: "＋ Note", onSelect: handlers.onOpenCapture },
    { label: "Sessions", onSelect: handlers.onOpenSessions },
    { label: "Activity", onSelect: handlers.onOpenActivity },
    { label: "All characters", onSelect: onAllCharacters, separatorBefore: true },
    // Leave is campaign-only (#1082): a solo session omits onLeave, so only End
    // surfaces. The separator rides whichever item leads the session group.
    ...(sessionActions?.onLeave
      ? [{ label: "Leave Session", onSelect: sessionActions.onLeave, disabled: sessionActions.busy, separatorBefore: true }]
      : []),
    ...(sessionActions
      ? [{ label: "End Session", onSelect: sessionActions.onEnd, disabled: sessionActions.busy, separatorBefore: !sessionActions.onLeave }]
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
}: MobileSheetHeaderProps) {
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const menuItems = buildMenuItems(
    { onOpenCapture, onOpenSessions, onOpenActivity, onOpenDelete },
    () => navigate("/"),
    sessionActions,
  );
  const live = sessionActions !== null;
  const pill = live ? <LivePill round={liveRound} onGoToCombat={onGoToCombat} /> : null;
  const openSwitcher = () => setSwitcherOpen(true);

  const renderVariant = (variant: HeaderVariant) => {
    const shared = { character, onUpdate, pill, menuItems, onOpenSwitcher: openSwitcher };
    return variant === "collapsed" ? <CollapsedBar {...shared} /> : <ExpandedSheetHeader {...shared} />;
  };

  return (
    <>
      <CollapseAnimator
        variant={scrolled ? "collapsed" : "expanded"}
        render={renderVariant}
        reducedMotion={reducedMotion}
      />
      {switcherOpen && <CharacterSwitcherSheet currentId={character.id} onClose={() => setSwitcherOpen(false)} />}
    </>
  );
}

/**
 * Animates the expanded⇄collapsed swap (#1083): pins the wrapper to the outgoing
 * height, eases it to the incoming height over 200ms, and crossfades the outgoing
 * variant out as an inert overlay (kept in normal a11y-hidden until it unmounts).
 * First mount and reduced-motion take the plain swap. transitionend finalizes,
 * with a 250ms fallback because that event is swallowed when the md breakpoint is
 * crossed or the tab is backgrounded (would otherwise leave height pinned).
 */
function CollapseAnimator({
  variant,
  render,
  reducedMotion,
}: {
  variant: HeaderVariant;
  render: (v: HeaderVariant) => React.ReactNode;
  reducedMotion: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const incomingRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<HeaderVariant>(variant);
  const [outgoing, setOutgoing] = useState<HeaderVariant | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  const finalize = useCallback(() => {
    setOutgoing(null);
    setHeight(null);
  }, []);

  useLayoutEffect(() => {
    if (variant === current) return;
    if (reducedMotion) {
      setCurrent(variant);
      return;
    }
    // Capture the outgoing height BEFORE the swap so the wrapper can hold it,
    // then (next effect) ease to the incoming height.
    setHeight(wrapperRef.current?.offsetHeight ?? null);
    setOutgoing(current);
    setCurrent(variant);
  }, [variant, current, reducedMotion]);

  useLayoutEffect(() => {
    if (outgoing === null) return;
    const target = incomingRef.current?.offsetHeight ?? null;
    const raf = requestAnimationFrame(() => {
      if (target !== null) setHeight(target);
    });
    const fallback = setTimeout(finalize, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [outgoing, current, finalize]);

  const animating = outgoing !== null;
  return (
    <div
      ref={wrapperRef}
      className={
        animating
          ? "relative overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none"
          : "relative"
      }
      style={height !== null ? { height } : undefined}
      onTransitionEnd={(e) => {
        if (e.propertyName === "height" && e.target === wrapperRef.current) finalize();
      }}
    >
      <div
        key={`in-${current}`}
        ref={incomingRef}
        className={animating ? "animate-[header-in_200ms_ease-out] motion-reduce:animate-none" : undefined}
      >
        {render(current)}
      </div>
      {outgoing !== null && (
        <div
          key={`out-${outgoing}`}
          // React 18 has no typed `inert` prop; set it imperatively so the
          // fading-out overlay is untabbable while it lingers.
          ref={(el) => {
            el?.setAttribute("inert", "");
          }}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 animate-[header-out_200ms_ease-out_forwards] motion-reduce:animate-none"
        >
          {render(outgoing)}
        </div>
      )}
    </div>
  );
}

/**
 * The collapsed one-line bar (#1026): avatar · name · HP + mini meter · live pill
 * · ⋯. The scroll-collapsed default — calm paper chrome so the panel below stays
 * the subject. Tapping the identity region opens the character switcher (#1027).
 */
function CollapsedBar({
  character,
  onUpdate,
  pill,
  menuItems,
  onOpenSwitcher,
}: {
  character: Character;
  onUpdate?: (character: Character) => void;
  pill: React.ReactNode;
  menuItems: SheetMenuItem[];
  onOpenSwitcher: () => void;
}) {
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
function ExpandedSheetHeader({
  character,
  onUpdate,
  pill,
  menuItems,
  onOpenSwitcher,
}: {
  character: Character;
  onUpdate?: (character: Character) => void;
  pill: React.ReactNode;
  menuItems: SheetMenuItem[];
  onOpenSwitcher: () => void;
}) {
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
