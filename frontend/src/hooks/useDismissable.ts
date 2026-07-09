import { useEffect, useRef, type RefObject } from "react";

interface UseDismissableOptions {
  open: boolean;
  wrapperRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
  onOutsideClick: () => void;
}

// Escape-to-close + mousedown-outside-to-close, listeners tied to `open`.
export function useDismissable({
  open,
  wrapperRef,
  onEscape,
  onOutsideClick,
}: UseDismissableOptions): void {
  const onEscapeRef = useRef(onEscape);
  const onOutsideClickRef = useRef(onOutsideClick);
  onEscapeRef.current = onEscape;
  onOutsideClickRef.current = onOutsideClick;

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onEscapeRef.current();
    }
    function handleMouseDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        onOutsideClickRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open, wrapperRef]);
}
