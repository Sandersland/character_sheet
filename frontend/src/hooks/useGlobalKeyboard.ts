import { useEffect, useRef } from "react";

// Document-level keydown listener that fires `onTrigger` on Cmd/Ctrl+J — the
// global shortcut that opens the quick-capture palette from anywhere on a
// character page. Mirrors the keydown attach/cleanup pattern in
// components/ui/Modal.tsx. The callback is held in a ref so the listener binds
// once and never goes stale, regardless of how the caller passes it.
export function useGlobalKeyboard(onTrigger: () => void): void {
  const handlerRef = useRef(onTrigger);
  handlerRef.current = onTrigger;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "j" || event.key === "J")) {
        event.preventDefault();
        handlerRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
