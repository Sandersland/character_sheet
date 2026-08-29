import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogChrome } from "@/hooks/useDialogChrome";
import { useDragToDismiss } from "@/hooks/useDragToDismiss";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";

interface BottomSheetProps {
  title: string;
  subtitle?: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
}

export default function BottomSheet({ title, subtitle, wide = false, onClose, children }: BottomSheetProps) {
  // requestClose is defined below and needs beginExit first; the ref lets Escape
  // call it anyway without useDialogChrome's callback identity depending on it.
  const closeRef = useRef<() => void>(() => {});
  const panelRef = useDialogChrome(() => closeRef.current());
  const titleId = useId();
  const [closing, setClosing] = useState(false);

  const isMobile = useIsBelowMd();

  // min() keeps the 85vh scrim gap when no keyboard is up; the px value wins
  // once an on-screen keyboard shrinks the viewport (#784).
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
      // Mouse-down-to-close is a pointer convenience only; Escape covers keyboard users.
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
        {/* handleProps spread on both grabber and header on purpose (siblings, so the drag gesture never double-fires). */}
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          {...handleProps}
          className="mx-auto mt-2 h-1 w-9 shrink-0 touch-none rounded-full bg-parchment-300 md:hidden"
        />
        {/* md:pt-3 matches Modal's header padding, filled by the grabber on mobile. */}
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
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
    </div>,
    document.body
  );
}
