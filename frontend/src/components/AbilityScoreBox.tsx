import { abilityModifier, formatModifier } from "../lib/abilities";

interface AbilityScoreBoxProps {
  label: string;
  score: number;
  saveProficient?: boolean;
}

/**
 * The classic D&D sheet "ability box": modifier is the primary value
 * (largest, highest contrast), raw score is secondary metadata tucked
 * into a small pill below it — per principles.md's "avoid naked
 * label:value pairs," the modifier *is* the number players read at the
 * table, so it gets the visual weight, not the label.
 */
export default function AbilityScoreBox({
  label,
  score,
  saveProficient,
}: AbilityScoreBoxProps) {
  const modifier = abilityModifier(score);

  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)] px-3 py-2.5 shadow-[var(--shadow-card)]">
      <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
        {label}
      </span>
      <span className="mt-1 font-display text-2xl font-semibold leading-none text-[var(--color-garnet-800)]">
        {formatModifier(modifier)}
      </span>
      <span className="mt-1.5 rounded-full border border-[var(--color-parchment-300)] bg-[var(--color-parchment-100)] px-2 py-0.5 text-xs tabular-nums text-[var(--color-parchment-700)]">
        {score}
      </span>
      {saveProficient && (
        <span
          className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--color-arcane-500)]"
          title="Proficient saving throw"
          aria-label="Proficient saving throw"
        />
      )}
    </div>
  );
}
