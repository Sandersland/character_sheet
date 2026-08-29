import { useRef } from "react";

import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";

// A swipe must travel this far horizontally, and dominantly so, to change tabs — otherwise it never fights the vertical scroll of the panels.
const SWIPE_THRESHOLD_PX = 56;

interface TouchStart {
  x: number;
  y: number;
  inHorizontalScroller: boolean;
}

// If any ancestor between the touch target and the swipe container scrolls horizontally (a filter strip, a wide table), the swipe belongs to it, not to tab navigation.
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

export function useSwipeTabs(
  tabs: SheetTab[],
  activeTab: SheetTabId,
  onTabChange: (id: SheetTabId) => void,
) {
  const startRef = useRef<TouchStart | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
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
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    const index = tabs.findIndex((t) => t.id === activeTab);
    if (index === -1) return;
    const nextIndex = dx < 0 ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= tabs.length) return;
    onTabChange(tabs[nextIndex].id);
  };

  // An OS-cancelled gesture (incoming call, notification pull-down) fires onTouchCancel instead of onTouchEnd; clear the start so the next gesture's end can't compute a delta from this stale one.
  const onTouchCancel = () => {
    startRef.current = null;
  };

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
