import { useState } from "react";

import { useCaptureHotkey } from "@/hooks/useCaptureHotkey";

// Open/close state for the quick-capture dock plus its ⌘J/Ctrl+J toggle, bundled
// so a character-context page (sheet, session) wires capture in one line (#865).
export function useCaptureDock(): {
  captureOpen: boolean;
  openCapture: () => void;
  closeCapture: () => void;
} {
  const [captureOpen, setCaptureOpen] = useState(false);
  useCaptureHotkey(() => setCaptureOpen((open) => !open));
  return {
    captureOpen,
    openCapture: () => setCaptureOpen(true),
    closeCapture: () => setCaptureOpen(false),
  };
}
