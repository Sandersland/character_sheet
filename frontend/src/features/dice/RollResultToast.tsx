/**
 * Quick-mode result chip (#945): a compact, auto-dismissing readout of the
 * most recent roll from `RollContext`. Shown only when the Dice-rolls
 * preference is `quick` (animated mode surfaces the result in DiceRollModal
 * instead). Auto-dismisses after 3s; a new roll resets the timer and replaces
 * the display immediately.
 *
 * Portaled to document.body and pinned top-center with a safe-area inset so it
 * never covers the sheet's bottom nav or key content on mobile. Suppressed
 * while any dialog is open (#801): mobile sheets and desktop modals draw a
 * full-screen scrim, and in-dialog rolls already show their result on the sheet.
 * Mount once inside `RollProvider`, at the `CharacterSheetPage` level.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useAnyDialogOpen } from "@/hooks/useDialogChrome";
import RollBreakdown from "@/features/dice/RollBreakdown";
import { useRoll, type RollEntry } from "@/features/dice/RollContext";

const DISMISS_MS = 3000;

export default function RollResultToast() {
  const { lastRoll } = useRoll();
  const anyDialogOpen = useAnyDialogOpen();
  const [visible, setVisible] = useState(false);
  // Hold a snapshot so the chip can fade out without losing its content.
  const [displayed, setDisplayed] = useState<RollEntry | null>(null);

  useEffect(() => {
    if (!lastRoll) return;
    setDisplayed(lastRoll);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [lastRoll?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!displayed || anyDialogOpen) return null;

  return createPortal(
    <div
      data-testid="roll-result-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`
        pointer-events-none fixed left-1/2 z-50 w-max max-w-[16rem] -translate-x-1/2
        top-[calc(env(safe-area-inset-top,0px)+0.75rem)]
        transition-all duration-300 ease-out
        ${visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}
      `}
    >
      <div className="rounded-card border border-parchment-200 bg-parchment-50/95 px-3 py-2 text-left shadow-lg backdrop-blur-sm">
        <RollBreakdown label={displayed.label} result={displayed.result} />
      </div>
    </div>,
    document.body,
  );
}
