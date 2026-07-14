import { useEffect, useState } from "react";

// The visible viewport geometry (height + top offset), tracking the on-screen
// keyboard. iOS Safari reports the keyboard-adjusted box on `window.visualViewport`
// (not `innerHeight`) and offsets the visual viewport's top when the layout
// viewport scrolls under the keyboard. The mobile quick-capture surface (#866)
// pins itself to this rect so its composer sits flush above the keyboard. Falls
// back to `innerHeight` / `0` when the API is absent (older browsers, jsdom).
export interface VisualViewportRect {
  height: number;
  offsetTop: number;
}

export function useVisualViewport(): VisualViewportRect {
  const [rect, setRect] = useState<VisualViewportRect>(() => readViewportRect());
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    // The keyboard animation fires a burst of resize+scroll events; coalesce them
    // to one rAF-aligned setRect so the pinned panel re-lays-out in step with the
    // paint instead of thrashing state per event (#877).
    let raf = 0;
    const sync = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setRect(readViewportRect());
      });
    };
    setRect(readViewportRect());
    if (!vv) return;
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
  return rect;
}

function readViewportRect(): VisualViewportRect {
  if (typeof window === "undefined") return { height: 0, offsetTop: 0 };
  const vv = window.visualViewport;
  return { height: vv?.height ?? window.innerHeight, offsetTop: vv?.offsetTop ?? 0 };
}
