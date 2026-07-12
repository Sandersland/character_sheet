import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogChrome } from "@/hooks/useDialogChrome";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * This app's overlay primitive — most "extra" surfaces (Add Item, Edit) are
 * inline expand-in-place panels within a Card, but read-only review surfaces
 * with their own scroll needs (the ActivityModal timeline) and confirm
 * dialogs are not edits bound to a row, so they get a real modal instead.
 * Built generically so any such surface can reuse it rather than reinventing
 * focus management.
 *
 * Visual DNA matches `Card` (parchment surface, `--radius-card`) but with
 * `--shadow-raised` instead of `--shadow-card` — already used elsewhere
 * (`CharacterCard`'s hover/focus state) as this app's "elevated" shadow, so
 * the panel reads as "a Card that lifted off the page." Close is a text
 * link, not an icon ✕ — this app has no icon-only controls anywhere, and
 * introducing one at the same moment as the first modal would be two new
 * things at once.
 */
export default function Modal({ title, onClose, children }: ModalProps) {
  const panelRef = useDialogChrome(onClose);
  const titleId = useId();

  return createPortal(
    <div
      // Presentational backdrop: the mouse-down-to-close is a pointer
      // convenience only — closing is keyboard-accessible via the Escape
      // handler above, so this element is not an interactive widget.
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4 backdrop-blur-sm"
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
        className="flex max-h-[80vh] w-full max-w-[36rem] flex-col rounded-card border border-parchment-200 bg-parchment-50 shadow-raised focus-visible:outline-none"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-parchment-200 px-4 py-3">
          <h2 id={titleId} className="font-display text-lg font-semibold text-parchment-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
