type MeterTone = "garnet" | "arcane" | "gold" | "vitality";

interface MeterBarProps {
  current: number;
  max: number;
  tone?: MeterTone;
  label?: string;
  className?: string;
}

const TONE_FILL: Record<MeterTone, string> = {
  // Not garnet-surface (#994): against the parchment-200 track (not the page)
  // it measures 2.65:1, failing WCAG SC 1.4.11 in dark. garnet-meter (#1403) is
  // frozen to garnet-600 values (3.95:1 dark / 3.56:1 light) to stay compliant.
  garnet: "bg-garnet-meter",
  arcane: "bg-arcane-500",
  gold: "bg-gold-500",
  vitality: "bg-vitality-500",
};

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
