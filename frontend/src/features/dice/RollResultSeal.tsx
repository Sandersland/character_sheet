/**
 * Roll-result "seal" (#956): the app's own material — a parchment slip pressed
 * with garnet wax — showing the most recent roll from `RollContext`. Replaces
 * the generic `RollResultToast`.
 *
 * Unlike the old toast this is a **top-layer overlay** (its own z tier above
 * dialogs) and is **never suppressed** while a Modal/BottomSheet is open — a
 * roll fired from inside a sheet still shows its result. It is NOT a dialog:
 * no focus trap, no scroll-lock, no dialog registration (that was the exact
 * suppression mechanism this ticket removes). Dismiss is D2 — a dim scrim
 * (lighter than a real modal) with tap-anywhere `pointerdown`.
 *
 * Outcome variants (colour + label, never colour alone): ordinary, a natural
 * 20 (vitality glow), a natural 1 (ashen garnet). Advantage/disadvantage shows
 * both dice with the dropped one struck through (via `RollBreakdown`).
 *
 * Mount once inside `RollProvider`, at the workspace level.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { isNaturalOne, isNaturalTwenty } from "@/lib/dice";
import RollBreakdown from "@/features/dice/RollBreakdown";
import { useRoll, type RollEntry } from "@/features/dice/RollContext";

// The seal's scrim intercepts pointer events (that's how tap-anywhere dismiss
// works), so it MUST clear itself — otherwise it would trap every tap after a
// roll until dismissed, blocking rapid in-combat rolling (roll-to-hit → roll
// damage) and any automated flow. Auto-dismiss after a short linger; a new roll
// resets it, a tap clears it immediately.
const DISMISS_MS = 2200;

type Outcome = "critical" | "fumble" | "normal";

function outcomeOf(entry: RollEntry): Outcome {
  if (isNaturalTwenty(entry.result)) return "critical";
  if (isNaturalOne(entry.result)) return "fumble";
  return "normal";
}

// The wax seal + slip border echo the outcome: vitality on a crit, ashen garnet
// on a fumble, ordinary garnet otherwise. Never colour alone — RollBreakdown
// also renders the "Natural 20 — Critical!" / "Natural 1 — Fumble" banner text.
const SLIP_VARIANT: Record<Outcome, string> = {
  critical: "border-vitality-300 shadow-[0_0_0_1px_var(--color-vitality-200),0_18px_40px_-12px_var(--color-vitality-500)]",
  fumble: "border-garnet-300 shadow-[0_18px_40px_-16px_var(--color-garnet-900)] saturate-50",
  normal: "border-parchment-200 shadow-xl",
};

// Carries its own text color per variant (#994) rather than the shared
// text-parchment-50 below: fumble/normal sit on the non-inverting
// garnet-surface pair, so a co-flipping label would go near-black on a
// saturated dark fill — the exact bug that pair exists to prevent.
const WAX_VARIANT: Record<Outcome, string> = {
  critical: "bg-vitality-600 text-parchment-50",
  fumble: "bg-garnet-surface-deep text-garnet-on-surface",
  normal: "bg-garnet-surface text-garnet-on-surface",
};

export default function RollResultSeal() {
  const { lastRoll } = useRoll();
  const [entry, setEntry] = useState<RollEntry | null>(null);

  // setLastRoll always publishes a fresh object with a unique ++idRef id, so keying on `lastRoll` is equivalent to its id — no re-fire on an identical id.
  useEffect(() => {
    if (!lastRoll) return;
    setEntry(lastRoll);
    const timer = setTimeout(() => setEntry(null), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [lastRoll]);

  if (!entry) return null;

  const outcome = outcomeOf(entry);

  return createPortal(
    <div
      data-testid="roll-result-seal"
      data-outcome={outcome}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // pointer-down (not click) so the dismissing tap can't also activate
      // whatever control sits under the finger once the scrim unmounts.
      onPointerDown={() => setEntry(null)}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/20 p-6 backdrop-blur-[1px]"
    >
      <div
        className={`relative flex max-w-xs flex-col items-center gap-2 rounded-card border bg-parchment-50 px-7 pb-6 pt-8 text-center ${SLIP_VARIANT[outcome]}`}
      >
        {/* Garnet wax seal pressed into the top of the slip. */}
        <span
          aria-hidden
          className={`absolute -top-4 flex h-9 w-9 items-center justify-center rounded-full shadow-md ${WAX_VARIANT[outcome]}`}
        >
          <span className="font-display text-sm leading-none">d20</span>
        </span>
        <RollBreakdown label={entry.label} result={entry.result} emphasis />
      </div>
    </div>,
    document.body,
  );
}
