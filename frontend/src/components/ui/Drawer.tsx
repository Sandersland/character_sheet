import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDialogChrome } from "@/hooks/useDialogChrome";

interface DrawerProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A right-edge slide-in panel (#1086) for md+ surfaces — the desktop home for the
 * session log, which never occupies page layout. Shares Modal/BottomSheet's
 * focus-trap / Escape / scroll-lock via `useDialogChrome`. Below md, callers pick
 * BottomSheet instead (via `useIsBelowMd`), so this stays desktop-only by contract.
 */
export default function Drawer({ title, onClose, children }: DrawerProps) {
  const panelRef = useDialogChrome(onClose);
  const titleId = useId();
  // Enter transition: mount off-screen right, then slide in on the next frame.
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);

  return createPortal(
    <div
      // Presentational scrim: mouse-down-to-close is a pointer convenience only —
      // Escape (via useDialogChrome) is the keyboard-accessible close path.
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-backdrop backdrop-blur-sm"
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
        className={`flex h-full w-full max-w-[24rem] flex-col border-l border-parchment-200 bg-parchment-50 shadow-raised transition-transform duration-200 focus-visible:outline-none ${entered ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-parchment-200 px-4 py-3">
          <h2 id={titleId} className="font-display text-lg font-semibold text-parchment-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xs font-semibold text-garnet-700 hover:underline"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
