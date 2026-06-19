import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * This app's first overlay primitive — every prior "extra" surface (Add
 * Item, Edit, Sell) is an inline expand-in-place panel within a Card, but
 * the inventory ledger (Phase C) is read-only review with its own scroll
 * needs, not an edit bound to a row, so it gets a real modal instead. Built
 * generically so a future modal (confirm dialogs, etc.) can reuse it rather
 * than reinventing focus management.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: "rgb(39 36 29 / 0.45)" }}
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
        className="flex max-h-[80vh] w-full max-w-[36rem] flex-col rounded-[var(--radius-card)] border border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)] shadow-[var(--shadow-raised)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-parchment-200)] px-4 py-3">
          <h2 id={titleId} className="font-display text-lg font-semibold text-[var(--color-parchment-900)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[var(--color-garnet-700)] hover:underline"
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
