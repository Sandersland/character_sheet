import { ChevronDown, Shield } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import MeterBar from "@/components/ui/MeterBar";
import OverflowMenu from "@/components/ui/OverflowMenu";
import Popover from "@/components/ui/Popover";
import ArmorClassBreakdown from "@/features/character-meta/ArmorClassBreakdown";
import CharacterSwitcherSheet from "@/features/character-meta/CharacterSwitcherSheet";
import ManageHpButton from "@/features/hitpoints/ManageHpButton";
import PreferencesSheet from "@/features/preferences/PreferencesSheet";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { classSummary, isMulticlass } from "@/lib/multiclass";

type HeaderVariant = "expanded" | "collapsed";

type SheetMenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; separatorBefore?: boolean };

// CollapsedBar and ExpandedSheetHeader each read the character via useCurrentCharacter() rather than taking it as a prop.
interface SubHeaderProps {
  pill: React.ReactNode;
  menuItems: SheetMenuItem[];
  onOpenSwitcher: () => void;
}

interface MobileSheetHeaderProps {
  // Non-null ⇒ a session is live and this character is in it; onLeave is omitted for a solo session (#1082) — Leave is campaign-only, End is not.
  sessionActions?: { busy: boolean; onLeave?: () => void; onEnd: () => void } | null;
  liveRound?: number | null;
  onGoToCombat?: () => void;
  scrolled?: boolean;
  onOpenCapture: () => void;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenDelete: () => void;
  onOpenCampaignSettings?: () => void;
}

function LivePill({ round, onGoToCombat }: { round: number | null; onGoToCombat?: () => void }) {
  const state = round != null ? `Round ${round}` : "Live";
  return (
    <button
      type="button"
      onClick={onGoToCombat}
      aria-label={`${state} — go to fight`}
      className="flex flex-none items-center gap-1.5 rounded-full bg-garnet-surface px-2.5 py-1 text-[11px] font-bold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-vitality-400 motion-safe:animate-pulse" />
      {state}
    </button>
  );
}

function AcBadge() {
  const { character } = useCurrentCharacter();
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
      <ArmorClassBreakdown />
    </Popover>
  );
}

function HpNumbers({ current, max, temp }: { current: number; max: number; temp: number }) {
  return (
    <span className="flex-none font-display text-sm font-semibold tabular-nums text-garnet-800">
      {current}
      <span className="font-normal text-parchment-600">/{max}</span>
      {temp > 0 && <span className="text-arcane-700"> +{temp}</span>}
    </span>
  );
}

// "Preferences…" is unconditional (#1167): this mobile shell hides AppHeader/AccountMenu, so without it mobile has no other way to reach Preferences while the sheet is open.
function buildMenuItems(
  handlers: Pick<MobileSheetHeaderProps, "onOpenCapture" | "onOpenSessions" | "onOpenActivity" | "onOpenDelete" | "onOpenCampaignSettings">,
  onAllCharacters: () => void,
  onOpenPreferences: () => void,
  sessionActions: MobileSheetHeaderProps["sessionActions"],
): SheetMenuItem[] {
  return [
    { label: "＋ Note", onSelect: handlers.onOpenCapture },
    { label: "Sessions", onSelect: handlers.onOpenSessions },
    { label: "Activity", onSelect: handlers.onOpenActivity },
    { label: "Preferences…", onSelect: onOpenPreferences },
    ...(handlers.onOpenCampaignSettings
      ? [{ label: "Campaign settings…", onSelect: handlers.onOpenCampaignSettings }]
      : []),
    { label: "All characters", onSelect: onAllCharacters, separatorBefore: true },
    // separatorBefore rides whichever of Leave/End leads the session group.
    ...(sessionActions?.onLeave
      ? [{ label: "Leave Session", onSelect: sessionActions.onLeave, disabled: sessionActions.busy, separatorBefore: true }]
      : []),
    ...(sessionActions
      ? [{ label: "End Session", onSelect: sessionActions.onEnd, disabled: sessionActions.busy, separatorBefore: !sessionActions.onLeave }]
      : []),
    { label: "Delete", onSelect: handlers.onOpenDelete, danger: true, separatorBefore: true },
  ];
}

export default function MobileSheetHeader({
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
  const { character } = useCurrentCharacter();
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const menuItems = buildMenuItems(
    { onOpenCapture, onOpenSessions, onOpenActivity, onOpenDelete, onOpenCampaignSettings },
    () => navigate("/"),
    () => setPrefsOpen(true),
    sessionActions,
  );
  const live = sessionActions !== null;
  const pill = live ? <LivePill round={liveRound} onGoToCombat={onGoToCombat} /> : null;
  const openSwitcher = () => setSwitcherOpen(true);

  const renderVariant = (variant: HeaderVariant) => {
    const shared = { pill, menuItems, onOpenSwitcher: openSwitcher };
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
      {prefsOpen && (
        <PreferencesSheet
          onClose={() => setPrefsOpen(false)}
          campaignId={character.campaignId}
          onOpenCampaignSettings={onOpenCampaignSettings}
        />
      )}
    </>
  );
}

// 250ms fallback because transitionend is swallowed when the md breakpoint is crossed or the tab is backgrounded.
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
    // Capture the outgoing height before the swap so the wrapper can hold it; the next effect eases to the incoming height.
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
          // React 18 has no typed `inert` prop; set it imperatively so the fading-out overlay is untabbable while it lingers.
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

function CollapsedBar({ pill, menuItems, onOpenSwitcher }: SubHeaderProps) {
  const { character } = useCurrentCharacter();
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
      <button
        type="button"
        onClick={onOpenSwitcher}
        aria-label="Switch character"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-control bg-gradient-to-br from-garnet-surface to-garnet-surface-deep font-display text-sm font-semibold text-garnet-on-surface shadow-raised">
          {character.name.charAt(0)}
        </span>
        <span className="truncate font-display text-[15px] font-semibold leading-tight text-garnet-800">
          {character.name}
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-none text-parchment-400" aria-hidden />
      </button>

      <ManageHpButton
        className="flex flex-none items-center gap-1.5 rounded-control px-1 py-0.5 transition-colors hover:bg-parchment-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
      >
        {hp}
      </ManageHpButton>

      {pill}
      <OverflowMenu label="Sheet actions" items={menuItems} />
    </header>
  );
}

function ExpandedSheetHeader({ pill, menuItems, onOpenSwitcher }: SubHeaderProps) {
  const { character } = useCurrentCharacter();
  const { current, max, temp } = character.hitPoints;

  // classSummary carries per-class levels for multiclass; single-class shows its own level (subclass moves to the trailing pill).
  const multiclass = isMulticlass(character.classes);
  const classLine = multiclass
    ? classSummary(character.classes, { name: character.class })
    : `${character.class} ${character.level}`;
  // For multiclass the subclasses already ride in classLine, so the pill shows the level instead.
  const levelPill = !multiclass && character.subclass ? character.subclass : `Lvl ${character.level}`;

  return (
    <header className="z-30 shrink-0 border-b border-parchment-200 bg-parchment-50 px-4 py-2.5 shadow-sm md:hidden">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSwitcher}
          aria-label="Switch character"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
        >
          <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control bg-gradient-to-br from-garnet-surface to-garnet-surface-deep font-display text-lg font-semibold text-garnet-on-surface shadow-raised">
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
            {/* Label served with the character (#1436), never resolved client-side. */}
            <Badge tone="neutral" className="mt-0.5">
              {character.rulesEditionLabel}
            </Badge>
          </span>
        </button>
        <span className="flex-none rounded-full bg-garnet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-garnet-700">
          {levelPill}
        </span>
        {pill}
        <OverflowMenu label="Sheet actions" items={menuItems} />
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <ManageHpButton
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1 py-0.5 text-left transition-colors hover:bg-parchment-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
        >
          <HpNumbers current={current} max={max} temp={temp} />
          <span className="min-w-0 flex-1">
            <MeterBar current={current} max={max} tone="vitality" label={`Hit points ${current} of ${max}`} />
          </span>
        </ManageHpButton>
        <AcBadge />
      </div>
    </header>
  );
}
