import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogChrome } from "@/hooks/useDialogChrome";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, onClose, children }: ModalProps) {
  const panelRef = useDialogChrome(onClose);
  const titleId = useId();

  return createPortal(
    <div
      // Mouse-down-to-close is a pointer convenience only; Escape covers keyboard users.
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
