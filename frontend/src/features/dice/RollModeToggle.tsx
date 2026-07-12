/**
 * Manual advantage/disadvantage toggle. Sets the sticky `mode` in `RollContext`
 * that every eligible d20 roll affordance (RollButton, stat rolls, saves,
 * attacks, initiative) picks up. Clicking the active mode returns to normal.
 * Mount once alongside `RollResultToast`, inside `RollProvider`.
 *
 * Placement is pure-CSS per breakpoint (#770): a fixed full-width docked bar at
 * `< md`, the original bottom-6 left-6 floating pill at `md:`.
 */

import type { RollMode } from "@/lib/dice";
import { useRoll } from "@/features/dice/RollContext";

const OPTIONS: { mode: Exclude<RollMode, "normal">; label: string; short: string }[] = [
  { mode: "advantage", label: "Advantage", short: "ADV" },
  { mode: "disadvantage", label: "Disadvantage", short: "DIS" },
];

export default function RollModeToggle() {
  const { mode, setMode } = useRoll();

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex justify-center border-t border-parchment-200 bg-parchment-50 px-2 pb-[env(safe-area-inset-bottom)] pt-2 md:inset-x-auto md:bottom-6 md:left-6 md:justify-start md:border-t-0 md:bg-transparent md:p-0">
      <div
        role="group"
        aria-label="Roll mode"
        className="flex gap-1 rounded-card border border-parchment-200 bg-parchment-50 p-1 shadow-sm md:shadow-lg"
      >
        <button
          type="button"
          aria-pressed={mode === "normal"}
          onClick={() => setMode("normal")}
          title="Roll normally"
          className={`cursor-pointer rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            mode === "normal"
              ? "bg-garnet-700 text-parchment-50"
              : "text-parchment-600 hover:bg-parchment-100"
          }`}
        >
          Normal
        </button>
        {OPTIONS.map(({ mode: value, label, short }) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(active ? "normal" : value)}
              title={`Roll with ${label.toLowerCase()}`}
              className={`cursor-pointer rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                active
                  ? value === "advantage"
                    ? "bg-gold-500 text-parchment-50"
                    : "bg-parchment-400 text-parchment-50"
                  : "text-parchment-600 hover:bg-parchment-100"
              }`}
            >
              <span aria-hidden="true">{short}</span>
              <span className="sr-only">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
