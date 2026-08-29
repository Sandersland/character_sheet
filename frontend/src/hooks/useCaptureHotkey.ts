import { useEffect, useRef } from "react";

// The dock marks its subtree with `data-capture-dock` so the guards below
// can exempt it.
export function useCaptureHotkey(onToggle: () => void): void {
  const handlerRef = useRef(onToggle);
  handlerRef.current = onToggle;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isCaptureChord(event) || event.repeat) return;
      if (isBlockedByDialog() || isBlockedByInput()) return;
      event.preventDefault();
      handlerRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

function isCaptureChord(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && (event.key === "j" || event.key === "J");
}

function isBlockedByDialog(): boolean {
  const openModal = document.querySelector('[aria-modal="true"]');
  return openModal != null && openModal.closest("[data-capture-dock]") == null;
}

function isBlockedByInput(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return active != null && isEditable(active) && active.closest("[data-capture-dock]") == null;
}

function isEditable(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
