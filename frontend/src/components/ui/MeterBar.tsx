type MeterTone = "garnet" | "arcane" | "gold" | "vitality";

interface MeterBarProps {
  current: number;
  max: number;
  tone?: MeterTone;
  label?: string;
  /** Track sizing override; defaults to the full-width 10px desktop bar. */
  className?: string;
}

const TONE_FILL: Record<MeterTone, string> = {
  // Deliberately NOT garnet-surface (#994): a meter fill's contrast reference is
  // its own parchment-200 track, not the page. garnet-surface measures 2.65:1
  // there and would fail SC 1.4.11 in dark. garnet-meter (#1403) is a dedicated
  // non-inverting token frozen to today's garnet-600 values (3.95:1 dark /
  // 3.56:1 light against the track) — see index.css's @theme comment.
  garnet: "bg-garnet-meter",
  arcane: "bg-arcane-500",
  gold: "bg-gold-500",
  vitality: "bg-vitality-500",
};

/**
 * Horizontal resource meter (HP, spell slot pool, etc). Color alone never
 * carries the value — the numeric current/max is always rendered as text
 * per colors.md ("never rely on color as the only signal").
 */
export default function MeterBar({
  current,
  max,
  tone = "garnet",
  label,
  className = "h-2.5 w-full",
}: MeterBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;

  return (
    <div
      role="meter"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? `${current} of ${max}`}
      className={`overflow-hidden rounded-full bg-parchment-200 ${className}`}
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]} transition-[width]`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
