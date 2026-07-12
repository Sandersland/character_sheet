import { useEffect, useState } from "react";

// True below Tailwind's `md` breakpoint (<768px). Drives per-breakpoint
// presentation splits — BottomSheet on mobile vs. a centered/top overlay at md+.
// The lazy initializer reads matchMedia synchronously so the first paint already
// picks the right surface (no mount/unmount flip on load).
export function useIsBelowMd(): boolean {
  const [isBelowMd, setIsBelowMd] = useState(
    () => typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsBelowMd(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isBelowMd;
}
