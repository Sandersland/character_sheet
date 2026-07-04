/**
 * Fixed-position toast that displays the most recent roll from `RollContext`.
 * Auto-dismisses after 3.5 seconds; a new roll resets the timer and replaces
 * the display immediately. Highlights natural 20 (crit) and natural 1 (fumble)
 * for single-d20 rolls (checks, saves, attacks, initiative).
 *
 * Mount once inside `RollProvider`, at the `CharacterSheetPage` level.
 */

import { useEffect, useState } from "react";

import { usesAdvantage } from "@/lib/dice";
import { useRoll, type RollEntry } from "@/features/dice/RollContext";

const DISMISS_MS = 3500;

function modifierSuffix(modifier: number): string {
  return modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` − ${Math.abs(modifier)}` : "";
}

export default function RollResultToast() {
  const { lastRoll } = useRoll();
  const [visible, setVisible] = useState(false);
  // Hold a snapshot so the toast can fade out without losing its content.
  const [displayed, setDisplayed] = useState<RollEntry | null>(null);

  useEffect(() => {
    if (!lastRoll) return;
    setDisplayed(lastRoll);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [lastRoll?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!displayed) return null;

  const { label, result } = displayed;
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
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`
        pointer-events-none fixed bottom-6 right-6 z-50 w-52
        transition-all duration-300 ease-out
        ${visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}
      `}
    >
      <div
        className={`
          flex flex-col gap-1 rounded-card p-4 shadow-lg
          ${
            isCrit
              ? "border-2 border-gold-400 bg-gold-50"
              : isFumble
                ? "border border-parchment-300 bg-parchment-100"
                : "border border-parchment-200 bg-parchment-50"
          }
        `}
      >
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
          className={`font-display text-3xl font-semibold leading-none ${
            isCrit
              ? "text-gold-800"
              : isFumble
                ? "text-parchment-600"
                : "text-garnet-800"
          }`}
        >
          {total}
        </p>
        <p className="text-[11px] tabular-nums text-parchment-600">
          {dice.length}d{spec.faces} (
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
    </div>
  );
}
