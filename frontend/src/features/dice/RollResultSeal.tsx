import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { isNaturalOne, isNaturalTwenty } from "@/lib/dice";
import RollBreakdown from "@/features/dice/RollBreakdown";
import { useRoll, type RollEntry } from "@/features/dice/RollContext";

// The scrim intercepts pointer events, so it must auto-dismiss itself or it would trap every tap until cleared.
const DISMISS_MS = 2200;

type Outcome = "critical" | "fumble" | "normal";

function outcomeOf(entry: RollEntry): Outcome {
  if (isNaturalTwenty(entry.result)) return "critical";
  if (isNaturalOne(entry.result)) return "fumble";
  return "normal";
}

// Never colour alone: RollBreakdown also renders the Critical!/Fumble banner text.
const SLIP_VARIANT: Record<Outcome, string> = {
  critical: "border-vitality-300 shadow-[0_0_0_1px_var(--color-vitality-200),0_18px_40px_-12px_var(--color-vitality-500)]",
  fumble: "border-garnet-300 shadow-[0_18px_40px_-16px_var(--color-garnet-900)] saturate-50",
  normal: "border-parchment-200 shadow-xl",
};

// fumble/normal sit on the non-inverting garnet-surface pair; a co-flipping text color would go near-black on the saturated fill.
const WAX_VARIANT: Record<Outcome, string> = {
  critical: "bg-vitality-600 text-parchment-50",
  fumble: "bg-garnet-surface-deep text-garnet-on-surface",
  normal: "bg-garnet-surface text-garnet-on-surface",
};

// Deliberately not a dialog (no focus trap, scroll-lock, or dialog registration), so it is never suppressed while a Modal/BottomSheet is open.
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
      // pointer-down (not click) so the dismissing tap can't also activate a control once the scrim unmounts.
      onPointerDown={() => setEntry(null)}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-backdrop/50 p-6 backdrop-blur-[1px]"
    >
      <div
        className={`relative flex max-w-xs flex-col items-center gap-2 rounded-card border bg-parchment-50 px-7 pb-6 pt-8 text-center ${SLIP_VARIANT[outcome]}`}
      >
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
