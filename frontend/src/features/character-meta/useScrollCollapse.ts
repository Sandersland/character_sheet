import { useEffect, useRef, useState } from "react";

/** Collapse only after the panels scroll this far; re-expand only back at the
 *  very top. The asymmetric down/up thresholds form a hysteresis dead zone so a
 *  rest a few px in can't oscillate the header (#1083). */
const COLLAPSE_AT = 16;

/** A re-expand signal (the sentinel back at the very top) is held this long
 *  before it's committed to state (#1859). Momentum/rubber-band scrolling
 *  routinely grazes scrollTop back through 0 more than once while still
 *  decelerating from an upward fling; committing on the first graze snapped
 *  the header open mid-gesture and shoved content down, then sometimes
 *  snapped shut again on the very next frame as the bounce carried scrollTop
 *  back past COLLAPSE_AT. Holding the commit for this window — and canceling
 *  it outright if the collapse observer refires in the meantime — lets a
 *  reversal that hasn't actually settled at the top pass without an abrupt,
 *  reversed flip. Collapsing itself stays synchronous: it's the happy-path
 *  scroll-down gesture and was never the reported jank.
 */
const REEXPAND_DEBOUNCE_MS = 120;

/**
 * Collapse-on-scroll for the mobile sheet header (#1026). Watches a zero-height
 * sentinel at the top of the panel scroller with TWO IntersectionObservers, each
 * acting on a single edge, so their conditions are disjoint and the mount-time
 * callback order can't race (#1083):
 * - collapse observer: a +COLLAPSE_AT top margin keeps the sentinel "in" for the
 *   first COLLAPSE_AT px, so it only *leaves* past the threshold ⇒ collapsed true;
 * - expand observer: no margin, so it only *enters* back at the very top ⇒ false,
 *   though that flip is debounced (REEXPAND_DEBOUNCE_MS, #1859) rather than
 *   applied straight from the callback — see above.
 * Between the two (the dead zone) both callbacks are ignored and state holds.
 * Desktop's container doesn't scroll, so the sentinel always intersects and
 * `collapsed` stays false there.
 */
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
          // A same-gesture bounce back past COLLAPSE_AT means the earlier
          // re-expand signal never actually settled at the top — drop it.
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
