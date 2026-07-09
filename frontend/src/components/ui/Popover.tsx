import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useDismissable } from "@/hooks/useDismissable";

interface PopoverProps {
  trigger: ReactNode;
  label: string;
  /** ReactNode, or a render fn receiving a `close()` so panel controls can dismiss the popover. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Preferred horizontal alignment; auto-flips if that side would overflow the viewport. */
  align?: "right" | "left";
  className?: string;
  triggerClassName?: string;
  /** Fired whenever the popover transitions open → closed (Escape, click-outside, or toggle). */
  onClose?: () => void;
}

// Owned-trigger disclosure popover for read-only detail panels (role=dialog);
// unlike DropdownMenu it has no menuitem semantics or roving focus.
export default function Popover({
  trigger,
  label,
  children,
  align = "left",
  className = "",
  triggerClassName = "",
  onClose,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  // `align` is the caller's *preferred* side; this is what actually renders after
  // the overflow check below (may flip so the panel stays inside the viewport).
  const [resolvedAlign, setResolvedAlign] = useState(align);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Stable close() handed to a render-prop child (setOpen is stable, triggerRef is a
  // ref) so it never defeats memoization of the panel content.
  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Notify the parent on every open → closed transition, whatever the cause
  // (Escape, click-outside, or a toggle-off) — lets callers reset panel state.
  useEffect(() => {
    if (wasOpen.current && !open) onClose?.();
    wasOpen.current = open;
  }, [open, onClose]);

  // Auto-flip: an anchored `left-0` panel near the viewport's right edge (e.g. a
  // right-column paper-doll slot on mobile) would extend past the screen and widen
  // the page. Measure on open — layout effect, so the flip lands before paint —
  // and fall back to the opposite side only when the preferred one overflows and
  // the other side actually fits. Recomputed on window resize while open.
  useLayoutEffect(() => {
    if (!open) return;

    function computeAlignment() {
      const anchorRect = wrapperRef.current?.getBoundingClientRect();
      if (!anchorRect) return;
      const panelWidth = panelRef.current?.offsetWidth || 224; // w-56 fallback pre-measure
      const viewportWidth = document.documentElement.clientWidth;
      const GUTTER = 8;
      const overflowsRight = anchorRect.left + panelWidth > viewportWidth - GUTTER;
      const overflowsLeft = anchorRect.right - panelWidth < GUTTER;
      let next = align;
      if (align === "left" && overflowsRight && !overflowsLeft) next = "right";
      else if (align === "right" && overflowsLeft && !overflowsRight) next = "left";
      setResolvedAlign(next);
    }

    computeAlignment();
    window.addEventListener("resize", computeAlignment);
    return () => window.removeEventListener("resize", computeAlignment);
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useDismissable({
    open,
    wrapperRef,
    onEscape: closePanel,
    onOutsideClick: () => setOpen(false),
  });

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600 ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          // Deliberately non-modal (no aria-modal/focus trap): anchored disclosure, background stays readable.
          aria-label={label}
          tabIndex={-1}
          className={`absolute ${resolvedAlign === "left" ? "left-0" : "right-0"} z-10 mt-1 min-w-[12rem] rounded-card border border-parchment-200 bg-parchment-50 shadow-raised focus:outline-none`}
        >
          {typeof children === "function" ? children(closePanel) : children}
        </div>
      )}
    </div>
  );
}
