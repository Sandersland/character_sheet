import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSwipeTabs } from "@/features/character-meta/useSwipeTabs";
import type { SheetTab } from "@/features/character-meta/sheetTabs";

const TABS: SheetTab[] = [
  { id: "overview", label: "Overview" },
  { id: "combat", label: "Combat" },
  { id: "inventory", label: "Inventory" },
];

// A minimal element that reports no horizontal overflow (jsdom defaults to 0),
// used as both target and currentTarget so the scroller-guard walk is a no-op.
function makeEl() {
  return document.createElement("div");
}

function touchStart(x: number, y: number) {
  const el = makeEl();
  return { touches: [{ clientX: x, clientY: y }], target: el, currentTarget: el } as unknown as React.TouchEvent;
}

function touchEnd(x: number, y: number) {
  return { changedTouches: [{ clientX: x, clientY: y }] } as unknown as React.TouchEvent;
}

function swipe(hook: ReturnType<typeof useSwipeTabs>, from: [number, number], to: [number, number]) {
  hook.onTouchStart(touchStart(from[0], from[1]));
  hook.onTouchEnd(touchEnd(to[0], to[1]));
}

describe("useSwipeTabs", () => {
  it("swipes left to the next tab", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useSwipeTabs(TABS, "overview", onTabChange));
    swipe(result.current, [200, 100], [100, 105]);
    expect(onTabChange).toHaveBeenCalledWith("combat");
  });

  it("swipes right to the previous tab", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useSwipeTabs(TABS, "combat", onTabChange));
    swipe(result.current, [100, 100], [220, 108]);
    expect(onTabChange).toHaveBeenCalledWith("overview");
  });

  it("clamps at the first tab (no wrap) on a right swipe", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useSwipeTabs(TABS, "overview", onTabChange));
    swipe(result.current, [100, 100], [220, 100]);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("clamps at the last tab (no wrap) on a left swipe", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useSwipeTabs(TABS, "inventory", onTabChange));
    swipe(result.current, [200, 100], [80, 100]);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("ignores a short horizontal drag", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useSwipeTabs(TABS, "overview", onTabChange));
    swipe(result.current, [200, 100], [170, 100]); // 30px < threshold
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("ignores a mostly-vertical gesture (a scroll, not a swipe)", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useSwipeTabs(TABS, "overview", onTabChange));
    swipe(result.current, [200, 100], [130, 260]); // dx 70, dy 160 — vertical dominates
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("ignores multi-touch gestures", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useSwipeTabs(TABS, "overview", onTabChange));
    const el = makeEl();
    result.current.onTouchStart({
      touches: [{ clientX: 200, clientY: 100 }, { clientX: 40, clientY: 100 }],
      target: el,
      currentTarget: el,
    } as unknown as React.TouchEvent);
    result.current.onTouchEnd(touchEnd(80, 100));
    expect(onTabChange).not.toHaveBeenCalled();
  });
});
