import { useRef } from "react";

import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";

// A swipe must travel this far horizontally to change tabs, and the gesture must
// be dominantly horizontal so it never fights the vertical scroll of the panels.
const SWIPE_THRESHOLD_PX = 56;

interface TouchStart {
  x: number;
  y: number;
  /** The gesture began inside a horizontally-scrollable element — leave it alone. */
  inHorizontalScroller: boolean;
}

// Walk from the touch target up to the swipe container; if any ancestor scrolls
// horizontally (a filter strip, a wide table), the swipe belongs to it, not to
// tab navigation.
function startedInHorizontalScroller(target: EventTarget | null, container: Element): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== container) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Horizontal swipe navigation across the sheet's panel tabs (#942, mobile). Moves
 * through `getSheetTabs` order and clamps at the ends (no wrap), staying in sync
 * with `activeTab` since it drives the same `onTabChange` the nav does. Acts only
 * on a dominant horizontal gesture and bails when the swipe starts inside an
 * in-panel horizontal scroller, so it never hijacks vertical scroll.
 */
export function useSwipeTabs(
  tabs: SheetTab[],
  activeTab: SheetTabId,
  onTabChange: (id: SheetTabId) => void,
) {
  const startRef = useRef<TouchStart | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    // Multi-touch (pinch/zoom) is never a tab swipe.
    if (e.touches.length !== 1) {
      startRef.current = null;
      return;
    }
    const touch = e.touches[0];
    startRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      inHorizontalScroller: startedInHorizontalScroller(e.target, e.currentTarget),
    };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start || start.inHorizontalScroller) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Far enough, and clearly horizontal rather than a diagonal scroll.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    const index = tabs.findIndex((t) => t.id === activeTab);
    if (index === -1) return;
    // Swipe left → next tab; swipe right → previous. Clamp at both ends.
    const nextIndex = dx < 0 ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= tabs.length) return;
    onTabChange(tabs[nextIndex].id);
  };

  return { onTouchStart, onTouchEnd };
}
