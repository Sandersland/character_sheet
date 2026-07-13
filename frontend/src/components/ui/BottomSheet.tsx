import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogChrome } from "@/hooks/useDialogChrome";
import { useDragToDismiss } from "@/hooks/useDragToDismiss";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";

interface BottomSheetProps {
  title: string;
  /** Optional muted line under the title (e.g. "Pick one — nothing is spent until you choose"). */
  subtitle?: string;
  /** Widen the md+ centered dialog to 42rem for two-column bodies (#811). Mobile is unaffected. */
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The turn UI's picker surface (#729). Shares `Modal`'s focus-trap / Escape /
 * body-scroll-lock machinery via `useDialogChrome`, and is **responsive** (#747):
 * on mobile it's a bottom-anchored slide-up sheet (`items-end`, full width, top
 * corners rounded, grabber handle — thumb-reachable); at `md`+ it presents as a
 * centered dialog (`md:items-center`, all corners rounded, no grabber), matching
 * `Modal`, since a full-width bottom drawer reads as awkward on a desktop screen.
 * On mobile the grabber is a real Close button and the sheet drags down to
 * dismiss (#767); both are inert at `md`+, where the text Close button returns.
 * On mobile every close path (grabber/Escape/scrim/drag) slides the sheet off
 * the bottom edge and fades the scrim in sync before onClose fires (#782); at
 * `md`+ the centered dialog keeps today's instant close.
 */
export default function BottomSheet({ title, subtitle, wide = false, onClose, children }: BottomSheetProps) {
  // Escape routes through the same close path; indirection keeps useDialogChrome
  // stable while requestClose is defined below (it needs beginExit first).
  const closeRef = useRef<() => void>(() => {});
  const panelRef = useDialogChrome(() => closeRef.current());
  const titleId = useId();
  const [closing, setClosing] = useState(false);

  // Gate the gesture off at md+, matching the pure-CSS breakpoint.
  const isMobile = useIsBelowMd();

  // On mobile cap the panel to the visible viewport so the body sits above the
  // on-screen keyboard, not behind it (#784). min() keeps the 85vh scrim gap
  // when no keyboard is up; the px value wins once the keyboard shrinks it.
  const viewportHeight = useVisualViewportHeight();
  const panelMaxHeight = isMobile ? `min(85vh, ${viewportHeight}px)` : undefined;

  const { handleProps, contentProps, beginExit } = useDragToDismiss(panelRef, {
    onDismiss: onClose,
    onExitStart: () => setClosing(true),
    enabled: isMobile,
  });

  function requestClose() {
    if (isMobile) beginExit();
    else onClose();
  }
  closeRef.current = requestClose;

  return createPortal(
    <div
      // Presentational scrim: mouse-down-to-close is a pointer convenience only —
      // closing is keyboard-accessible via the Escape handler above.
      role="presentation"
      className={`fixed inset-0 z-50 flex items-end justify-center bg-backdrop backdrop-blur-sm md:items-center md:p-4 ${isMobile ? "transition-opacity duration-500" : ""} ${closing ? "opacity-0" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={panelMaxHeight ? { maxHeight: panelMaxHeight } : undefined}
        className={`flex max-h-[85vh] w-full flex-col rounded-t-card border border-b-0 border-parchment-200 bg-parchment-50 shadow-raised focus-visible:outline-none md:max-h-[80vh] md:rounded-card md:border-b ${wide ? "max-w-[36rem] md:max-w-2xl" : "max-w-[36rem]"}`}
      >
        {/* handleProps is spread on both grabber and header on purpose: a wide
            drag target. They're siblings, so the gesture never double-fires. */}
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          {...handleProps}
          className="mx-auto mt-2 h-1 w-9 shrink-0 touch-none rounded-full bg-parchment-300 md:hidden"
        />
        {/* md:pt-3 restores Modal's header padding on desktop, where the
            grabber (which fills the gap on mobile) is hidden. */}
        <div
          {...handleProps}
          className="flex shrink-0 touch-none items-start justify-between gap-3 px-4 pb-3 pt-2 md:touch-auto md:pt-3"
        >
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
            onClick={requestClose}
            className="hidden shrink-0 pt-1 text-xs font-semibold text-garnet-700 hover:underline md:block"
          >
            Close
          </button>
        </div>
        <div
          {...contentProps}
          className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
