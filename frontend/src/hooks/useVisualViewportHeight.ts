import { useEffect, useState } from "react";

// The visible viewport height, shrinking when the on-screen keyboard opens.
// Tracks `window.visualViewport` (iOS Safari reports the keyboard-adjusted
// height there, not on `innerHeight`); falls back to `innerHeight` when the
// API is absent. Used to cap the BottomSheet body above the keyboard (#784).
export function useVisualViewportHeight(): number {
  const [height, setHeight] = useState(() => readViewportHeight());
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    const sync = () => setHeight(readViewportHeight());
    sync();
    if (!vv) return;
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
  return height;
}

function readViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}
