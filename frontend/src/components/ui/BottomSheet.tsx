import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogChrome } from "@/hooks/useDialogChrome";

interface BottomSheetProps {
  title: string;
  /** Optional muted line under the title (e.g. "Pick one — nothing is spent until you choose"). */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom-anchored slide-up sheet — the standard mobile picker for the turn UI
 * (#729). Shares `Modal`'s focus-trap / Escape / body-scroll-lock machinery,
 * but slides up from the bottom edge (`items-end`), spans the full width, and
 * carries a grabber handle so it reads as a thumb-reachable sheet rather than a
 * centered dialog. Same parchment/`--radius-card`/`--shadow-raised` visual DNA
 * as `Modal`, rounded on the top corners only.
 */
export default function BottomSheet({ title, subtitle, onClose, children }: BottomSheetProps) {
  const panelRef = useDialogChrome(onClose);
  const titleId = useId();

  return createPortal(
    <div
      // Presentational scrim: mouse-down-to-close is a pointer convenience only —
      // closing is keyboard-accessible via the Escape handler above.
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-backdrop backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-[36rem] flex-col rounded-t-card border border-b-0 border-parchment-200 bg-parchment-50 shadow-raised"
      >
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-parchment-300"
        />
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-2">
          <div>
            <h2 id={titleId} className="font-display text-lg font-semibold text-parchment-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 pt-1 text-xs font-semibold text-garnet-700 hover:underline"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
