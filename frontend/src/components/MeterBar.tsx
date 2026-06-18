type MeterTone = "garnet" | "arcane" | "gold";

interface MeterBarProps {
  current: number;
  max: number;
  tone?: MeterTone;
  label?: string;
}

const TONE_FILL: Record<MeterTone, string> = {
  garnet: "bg-[var(--color-garnet-600)]",
  arcane: "bg-[var(--color-arcane-500)]",
  gold: "bg-[var(--color-gold-500)]",
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
}: MeterBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;

  return (
    <div
      role="meter"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? `${current} of ${max}`}
      className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-parchment-200)]"
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]} transition-[width]`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
