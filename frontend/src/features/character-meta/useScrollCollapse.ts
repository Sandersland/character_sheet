import { useEffect, useRef, useState } from "react";

// Asymmetric down/up thresholds form a hysteresis dead zone so a rest a few px in can't oscillate the header.
const COLLAPSE_AT = 16;

// Momentum/rubber-band scrolling can graze scrollTop back through 0 more than once while still decelerating from an upward fling, so the re-expand signal is held this long (and dropped if the collapse observer refires) before it commits to state.
const REEXPAND_DEBOUNCE_MS = 120;

// Two IntersectionObservers, one per edge, so their trigger conditions are disjoint and the mount-time callback order can't race; desktop's container doesn't scroll, so collapsed stays false there.
export function useScrollCollapse() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const reexpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    function clearPendingReexpand() {
      if (reexpandTimer.current != null) {
        clearTimeout(reexpandTimer.current);
        reexpandTimer.current = null;
      }
    }

    const collapseObs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          // A same-gesture bounce back past COLLAPSE_AT means the earlier re-expand signal never actually settled at the top.
          clearPendingReexpand();
          setCollapsed(true);
        }
      },
      { root, rootMargin: `${COLLAPSE_AT}px 0px 0px 0px`, threshold: 0 },
    );
    const expandObs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        clearPendingReexpand();
        reexpandTimer.current = setTimeout(() => {
          reexpandTimer.current = null;
          setCollapsed(false);
        }, REEXPAND_DEBOUNCE_MS);
      },
      { root, threshold: 0 },
    );
    collapseObs.observe(sentinel);
    expandObs.observe(sentinel);
    return () => {
      clearPendingReexpand();
      collapseObs.disconnect();
      expandObs.disconnect();
    };
  }, []);

  return { scrollRef, sentinelRef, collapsed };
}
