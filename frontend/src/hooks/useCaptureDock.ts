import { useState } from "react";

import { useCaptureHotkey } from "@/hooks/useCaptureHotkey";

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
