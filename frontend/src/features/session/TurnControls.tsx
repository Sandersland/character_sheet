// Shared presentational primitives for the TurnHub slots.

import type { IconType } from "react-icons";

type SlotTone = "garnet" | "arcane" | "neutral";

const SLOT_TONES: Record<SlotTone, { border: string; tile: string; useBtn: string }> = {
  garnet: {
    border: "border-garnet-200",
    tile: "bg-garnet-100 text-garnet-700",
    useBtn: "border-garnet-300 bg-garnet-700 text-parchment-50 hover:bg-garnet-800",
  },
  arcane: {
    border: "border-arcane-200",
    tile: "bg-arcane-100 text-arcane-700",
    useBtn: "border-arcane-300 bg-arcane-700 text-parchment-50 hover:bg-arcane-800",
  },
  neutral: {
    border: "border-parchment-200",
    tile: "bg-parchment-200 text-parchment-600",
    useBtn: "border-garnet-300 bg-garnet-700 text-parchment-50 hover:bg-garnet-800",
  },
};

/**
 * A turn-economy slot rendered as a large tap target (#729): an icon tile, the
 * slot name + a preview of what's inside, and a solid "Use" button that opens
 * the slot's bottom-sheet picker. `used` dims the whole row and hides the
 * button. Any counters/results render as `children` beneath the row.
 */
export function TurnSlotCard({
  icon: Icon,
  title,
  preview,
  tone,
  used,
  usedLabel = "used",
  badge,
  onUse,
  useLabel,
  children,
}: {
  icon: IconType;
  title: string;
  preview: string;
  tone: SlotTone;
  used: boolean;
  usedLabel?: string;
  /** Optional count chip beside the title (e.g. "×2" when two actions remain). */
  badge?: string;
  /** When provided, renders the Use button; omit to render a static row (no action left). */
  onUse?: () => void;
  /** Accessible name for the Use button — kept as "Use Action/Bonus/Reaction" for tests + a11y. */
  useLabel: string;
  children?: React.ReactNode;
}) {
  const t = SLOT_TONES[tone];
  return (
    <div className={`rounded-card border bg-parchment-50 p-3 ${t.border} ${used ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${t.tile}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-parchment-800">
            {title}
            {badge && !used && (
              <span className="rounded-full bg-garnet-100 px-1.5 text-[10px] font-bold text-garnet-700">
                {badge}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-parchment-600">{used ? usedLabel : preview}</p>
        </div>
        {onUse && !used && (
          <button
            type="button"
            onClick={onUse}
            aria-label={useLabel}
            className={`shrink-0 rounded-control border px-4 py-2 text-xs font-semibold shadow-sm transition-colors ${t.useBtn}`}
          >
            Use
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function QuickBtn({
  onClick,
  disabled,
  children,
  tone = "neutral",
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "garnet" | "neutral" | "arcane" | "gold";
  title?: string;
}) {
  const toneClass =
    tone === "garnet"
      ? "border-garnet-200 bg-garnet-50 text-garnet-700 hover:bg-garnet-100"
      : tone === "arcane"
        ? "border-arcane-200 bg-arcane-50 text-arcane-700 hover:bg-arcane-100"
        : tone === "gold"
          ? "border-gold-300 bg-gold-50 text-gold-800 hover:bg-gold-100"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-control border px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function AttackCounter({
  total,
  used,
  label,
}: {
  total: number;
  used: number;
  label: string;
}) {
  const remaining = total - used;
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-control border border-garnet-200 bg-garnet-50 px-3 py-1.5">
      <span className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              i < used ? "bg-parchment-300" : "bg-garnet-600"
            }`}
          />
        ))}
      </span>
      <span className="text-xs font-medium text-garnet-700">
        {label}: {remaining} of {total} remaining
      </span>
    </div>
  );
}

/** Inline outcome strip shown in the Reaction slot after the reaction is spent. */
export function ReactionResult({
  message,
  tone = "gold",
}: {
  message: string | null;
  tone?: "gold" | "garnet";
}) {
  if (!message) return null;
  const wrapperCls =
    tone === "garnet"
      ? "border-garnet-200 bg-garnet-50 text-garnet-700"
      : "border-gold-200 bg-gold-50 text-gold-800";
  const labelCls = tone === "garnet" ? "text-garnet-600" : "text-gold-800";
  return (
    <div className={`mt-2 rounded-control border px-3 py-2 ${wrapperCls}`}>
      <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${labelCls}`}>
        Reaction used
      </p>
      <p className="text-xs font-semibold leading-snug">{message}</p>
    </div>
  );
}
