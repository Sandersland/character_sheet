import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useDismissable } from "@/hooks/useDismissable";

interface PopoverProps {
  trigger: ReactNode;
  label: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "right" | "left";
  className?: string;
  triggerClassName?: string;
  id?: string;
  onClose?: () => void;
}

export default function Popover({
  trigger,
  label,
  children,
  align = "left",
  className = "",
  triggerClassName = "",
  id,
  onClose,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  // `align` is the caller's preferred side; `resolvedAlign` is what actually
  // renders once the overflow check below may flip it.
  const [resolvedAlign, setResolvedAlign] = useState(align);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // setOpen is stable and triggerRef is a ref, so this identity never changes
  // and never defeats memoization of the panel content.
  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (wasOpen.current && !open) onClose?.();
    wasOpen.current = open;
  }, [open, onClose]);

  // Auto-flip so an anchored panel doesn't extend past the viewport edge and
  // widen the page. Measured in a layout effect so the flip lands before paint,
  // and only flips when the preferred side overflows but the other side fits.
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
        id={id}
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
          // Deliberately non-modal: no aria-modal or focus trap, so the background stays readable.
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
