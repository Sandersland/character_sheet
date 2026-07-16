/**
 * Shared roll-result readout (#945): source label, total, and the
 * dice/modifier breakdown, with crit / fumble / advantage flags. Rendered by
 * both the Quick-mode compact chip (RollResultToast) and the Animated-mode
 * settle overlay (DiceRollModal) so both surfaces carry identical information
 * and can never drift.
 */

import { usesAdvantage, type RollResult } from "@/lib/dice";

function modifierSuffix(modifier: number): string {
  return modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` − ${Math.abs(modifier)}` : "";
}

interface RollBreakdownProps {
  label: string;
  result: RollResult;
  /** Larger total for the modal settle; the compact chip leaves this off. */
  emphasis?: boolean;
}

export default function RollBreakdown({ label, result, emphasis = false }: RollBreakdownProps) {
  const { total, dice, spec, modifier } = result;

  // Crit/fumble only applies to a single d20 roll (checks, saves, attacks, initiative).
  const isD20Single = spec.faces === 20 && spec.count === 1;
  const advantage = usesAdvantage(spec);
  // The taken die under advantage/disadvantage is the kept (non-dropped) one.
  const takenDie = dice.find((d) => !d.dropped) ?? dice[0];
  const naturalRoll = isD20Single ? (takenDie?.value ?? 0) : 0;
  const isCrit = naturalRoll === 20;
  const isFumble = naturalRoll === 1;

  return (
    <div className="flex flex-col gap-0.5">
      {isCrit && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-800">
          Natural 20 — Critical!
        </p>
      )}
      {isFumble && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-parchment-600">
          Natural 1 — Fumble
        </p>
      )}
      {advantage && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-garnet-700">
          {spec.mode === "advantage" ? "Advantage" : "Disadvantage"}
        </p>
      )}
      <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        {label}
      </p>
      <p
        className={`font-display font-semibold leading-none tabular-nums ${
          emphasis ? "text-4xl" : "text-3xl"
        } ${isCrit ? "text-gold-800" : isFumble ? "text-parchment-600" : "text-garnet-800"}`}
      >
        {total}
      </p>
      <p className="text-[11px] tabular-nums text-parchment-600">
        {spec.count}d{spec.faces} (
        {dice.map((die, index) => (
          <span key={index}>
            {index > 0 && ", "}
            <span className={die.dropped ? "text-parchment-400 line-through" : ""}>
              {die.value}
            </span>
          </span>
        ))}
        ){modifierSuffix(modifier)}
      </p>
    </div>
  );
}
