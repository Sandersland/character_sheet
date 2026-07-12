import { useEffect, useRef, useSyncExternalStore } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-scoped count of mounted dialog surfaces (every Modal/BottomSheet calls
// useDialogChrome, so each participates). Drives useAnyDialogOpen (#801).
let openDialogCount = 0;
const dialogListeners = new Set<() => void>();

function emitDialogChange() {
  dialogListeners.forEach((listener) => listener());
}

/** True while any Modal/BottomSheet is mounted; subscribes to the shared count. */
export function useAnyDialogOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      dialogListeners.add(listener);
      return () => dialogListeners.delete(listener);
    },
    () => openDialogCount > 0,
    () => false,
  );
}

/**
 * Shared overlay behavior for the app's dialog surfaces — `Modal` (centered)
 * and `BottomSheet` (slide-up). On mount: focus the panel, lock body scroll.
 * While open: trap Tab within the panel and close on Escape. On unmount:
 * restore the previous scroll + focus. Returns a ref to attach to the panel
 * element. Extracted (#729) so the two surfaces share one implementation
 * instead of duplicating the focus-management block.
 */
export function useDialogChrome(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose in a ref so the effect below runs on mount/unmount
  // ONLY. Call sites pass inline arrows (identity changes every render); if the
  // effect depended on `onClose` it would re-run on every parent re-render —
  // re-focusing the panel (stealing focus mid-keystroke, e.g. a text input in
  // the sheet) and re-capturing `previouslyFocused` as the panel itself (so the
  // trigger never regains focus on close).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // preventScroll so iOS doesn't reveal-scroll the fixed sheet on focus (#784).
    panelRef.current?.focus({ preventScroll: true });

    openDialogCount += 1;
    emitDialogChange();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
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
      openDialogCount = Math.max(0, openDialogCount - 1);
      emitDialogChange();
      previouslyFocused?.focus();
    };
  }, []);

  return panelRef;
}
