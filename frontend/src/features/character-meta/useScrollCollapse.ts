import { useEffect, useRef, useState } from "react";

/** Collapse only after the panels scroll this far; re-expand only back at the
 *  very top. The asymmetric down/up thresholds form a hysteresis dead zone so a
 *  rest a few px in can't oscillate the header (#1083). */
const COLLAPSE_AT = 16;

/**
 * Collapse-on-scroll for the mobile sheet header (#1026). Watches a zero-height
 * sentinel at the top of the panel scroller with TWO IntersectionObservers, each
 * acting on a single edge, so their conditions are disjoint and the mount-time
 * callback order can't race (#1083):
 * - collapse observer: a +COLLAPSE_AT top margin keeps the sentinel "in" for the
 *   first COLLAPSE_AT px, so it only *leaves* past the threshold ⇒ collapsed true;
 * - expand observer: no margin, so it only *enters* back at the very top ⇒ false.
 * Between the two (the dead zone) both callbacks are ignored and state holds.
 * Desktop's container doesn't scroll, so the sentinel always intersects and
 * `collapsed` stays false there.
 */
export function useScrollCollapse() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const collapseObs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setCollapsed(true);
      },
      { root, rootMargin: `${COLLAPSE_AT}px 0px 0px 0px`, threshold: 0 },
    );
    const expandObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setCollapsed(false);
      },
      { root, threshold: 0 },
    );
    collapseObs.observe(sentinel);
    expandObs.observe(sentinel);
    return () => {
      collapseObs.disconnect();
      expandObs.disconnect();
    };
  }, []);

  return { scrollRef, sentinelRef, collapsed };
}
