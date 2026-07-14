import { useEffect, useRef } from "react";

// ⌘J (mac) / Ctrl+J toggles the quick-capture dock on character-context pages
// (sheet, session, journal). The callback is held in a ref so the listener binds
// once and always calls the latest toggle.
//
// Two guards keep the shortcut from hijacking real typing (#865):
//   - a modal dialog is open (anything with [aria-modal="true"]) — except the dock
//     itself, so ⌘J still closes it — and
//   - focus sits in an editable element OUTSIDE the dock (a sheet input/textarea/
//     contenteditable); inside the dock composer ⌘J still toggles it shut.
// The dock marks its subtree with `data-capture-dock` so both guards can exempt it.
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

// A modal dialog other than the dock owns the keyboard — leave it alone.
function isBlockedByDialog(): boolean {
  const openModal = document.querySelector('[aria-modal="true"]');
  return openModal != null && openModal.closest("[data-capture-dock]") == null;
}

// Typing in a field outside the dock — don't steal the keystroke.
function isBlockedByInput(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return active != null && isEditable(active) && active.closest("[data-capture-dock]") == null;
}

function isEditable(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
