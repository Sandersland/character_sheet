/**
 * OptionCard — the rich option cards inside the TurnHub picker sheets.
 *
 * Three variants:
 *   row  — full-width card: icon tile · bold title + one-line subtitle · right Badge.
 *   half — compact half-width card for a `grid grid-cols-2` pair (Dash / Dodge).
 *   tile — vertical compact tile for the "More actions" disclosure grid.
 *
 * `ariaLabel` defaults to the bare title so tests and assistive tech address
 * options by name regardless of subtitle/badge content. Session-scoped on
 * purpose (like TurnSlotCard) — the tone palette and variants exist solely
 * for the turn pickers.
 */

import Badge, { type BadgeTone } from "@/components/ui/Badge";

/** Accepts both react-icons (IconType) and lucide-react icon components. */
export type OptionIcon = React.ComponentType<{ className?: string }>;

type OptionTone = "garnet" | "arcane" | "gold" | "vitality" | "neutral";

// Static map — Tailwind can't see dynamically-built class names.
const OPTION_TONES: Record<OptionTone, { border: string; tile: string; hover: string }> = {
  garnet: {
    border: "border-garnet-200",
    tile: "bg-garnet-100 text-garnet-700",
    hover: "hover:bg-garnet-50",
  },
  arcane: {
    border: "border-arcane-200",
    tile: "bg-arcane-100 text-arcane-700",
    hover: "hover:bg-arcane-50",
  },
  gold: {
    border: "border-gold-300",
    tile: "bg-gold-100 text-gold-800",
    hover: "hover:bg-gold-50",
  },
  vitality: {
    border: "border-vitality-200",
    tile: "bg-vitality-100 text-vitality-700",
    hover: "hover:bg-vitality-50",
  },
  neutral: {
    border: "border-parchment-300",
    tile: "bg-parchment-200 text-parchment-600",
    hover: "hover:bg-parchment-100",
  },
};

interface OptionCardProps {
  icon: OptionIcon;
  title: string;
  /** One-line muted context (weapon summary, spell effect, "Just mark it used"). */
  subtitle?: string;
  /** Right-aligned cost/uses badge ("×2", "1 / rest", "L1 slot", "free"). */
  badge?: string;
  /** Defaults to the card tone (neutral badge on a neutral card, etc.). */
  badgeTone?: BadgeTone;
  tone?: OptionTone;
  variant?: "row" | "half" | "tile";
  disabled?: boolean;
  /** Shown as the button title (hover/long-press) when disabled. */
  disabledReason?: string;
  onClick: () => void;
  /** Accessible name — defaults to the bare title. */
  ariaLabel?: string;
}

/** Vertical compact tile for the "More actions" 3-col grid. */
function OptionTile({
  icon: Icon,
  title,
  subtitle,
  disabled,
  disabledReason,
  onClick,
  ariaLabel,
  base,
  tileCls,
}: OptionCardProps & { base: string; tileCls: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabledReason}
      aria-label={ariaLabel ?? title}
      className={`flex flex-col items-center gap-1 p-2 ${base}`}
    >
      <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-control ${tileCls}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-xs font-semibold text-parchment-800">{title}</span>
      {subtitle && <span className="text-[10px] leading-tight text-parchment-500">{subtitle}</span>}
    </button>
  );
}

export default function OptionCard(props: OptionCardProps) {
  const { icon: Icon, title, subtitle, badge, badgeTone, tone = "neutral", variant = "row" } = props;
  const t = OPTION_TONES[tone];
  const base = `rounded-card border bg-parchment-50 text-left transition-colors ${t.border} ${t.hover} disabled:cursor-not-allowed disabled:opacity-40`;

  if (variant === "tile") {
    return <OptionTile {...props} base={base} tileCls={t.tile} />;
  }

  const compact = variant === "half";
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.disabledReason}
      aria-label={props.ariaLabel ?? title}
      className={`flex w-full items-center gap-3 ${compact ? "p-2.5" : "p-3"} ${base}`}
    >
      <span
        aria-hidden
        className={`flex ${compact ? "h-8 w-8" : "h-9 w-9"} shrink-0 items-center justify-center rounded-control ${t.tile}`}
      >
        <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-parchment-900">{title}</span>
        {subtitle && <span className="block truncate text-xs text-parchment-600">{subtitle}</span>}
      </span>
      {badge && (
        <Badge tone={badgeTone ?? tone} className="shrink-0">
          {badge}
        </Badge>
      )}
    </button>
  );
}
