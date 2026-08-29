import { useEffect, useState } from "react";

// iOS Safari reports the keyboard-adjusted viewport on window.visualViewport, not innerHeight (falls back to innerHeight/0 when absent).
export interface VisualViewportRect {
  height: number;
  offsetTop: number;
}

export function useVisualViewport(): VisualViewportRect {
  const [rect, setRect] = useState<VisualViewportRect>(() => readViewportRect());
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    // Coalesce the keyboard animation's resize/scroll burst to one rAF-aligned setRect instead of thrashing state per event (#877).
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
