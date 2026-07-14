import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useVisualViewport } from "@/hooks/useVisualViewport";

type Listener = () => void;

function stubVisualViewport(height: number, offsetTop: number) {
  const listeners: Record<string, Listener[]> = { resize: [], scroll: [] };
  const vv = {
    height,
    offsetTop,
    addEventListener: (type: string, cb: Listener) => {
      (listeners[type] ??= []).push(cb);
    },
    removeEventListener: (type: string, cb: Listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb);
    },
  };
  vi.stubGlobal("visualViewport", vv);
  const fire = (type: string) => listeners[type]?.forEach((l) => l());
  return { vv, fire, listeners };
}

describe("useVisualViewport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the initial height and offsetTop", () => {
    stubVisualViewport(700, 0);
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toEqual({ height: 700, offsetTop: 0 });
  });

  it("re-reads the rect on a keyboard resize (rAF-coalesced)", () => {
    // Run rAF callbacks synchronously so the throttled update is observable.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const { vv, fire } = stubVisualViewport(700, 0);
    const { result } = renderHook(() => useVisualViewport());
    act(() => {
      vv.height = 380;
      vv.offsetTop = 60;
      fire("resize");
    });
    expect(result.current).toEqual({ height: 380, offsetTop: 60 });
  });

  it("coalesces a burst of events into a single rAF flush", () => {
    let queued: FrameRequestCallback | null = null;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      queued = cb;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    const { vv, fire } = stubVisualViewport(700, 0);
    renderHook(() => useVisualViewport());
    raf.mockClear();
    act(() => {
      vv.height = 500;
      fire("resize");
      fire("scroll");
      fire("resize");
    });
    // Three events, one scheduled frame.
    expect(raf).toHaveBeenCalledTimes(1);
    act(() => queued?.(0));
  });

  it("removes its listeners on unmount", () => {
    const { listeners } = stubVisualViewport(700, 0);
    const { unmount } = renderHook(() => useVisualViewport());
    expect(listeners.resize.length).toBe(1);
    unmount();
    expect(listeners.resize.length).toBe(0);
    expect(listeners.scroll.length).toBe(0);
  });
});
