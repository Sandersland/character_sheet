import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDialogChrome } from "@/hooks/useDialogChrome";

interface DrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Drawer({ title, subtitle, onClose, children }: DrawerProps) {
  const panelRef = useDialogChrome(onClose);
  const titleId = useId();
  // Mounts off-screen right, then slides in on the next frame.
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);

  return createPortal(
    <div
      // Mouse-down-to-close is a pointer convenience only; Escape covers keyboard users.
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
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-parchment-200 px-4 py-3">
          <div>
            <h2 id={titleId} className="font-display text-lg font-semibold text-parchment-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-parchment-500">{subtitle}</p>}
          </div>
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
