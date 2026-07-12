import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";

type Listener = () => void;

function stubVisualViewport(initialHeight: number) {
  const listeners: Record<string, Listener[]> = { resize: [], scroll: [] };
  const vv = {
    height: initialHeight,
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

describe("useVisualViewportHeight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the initial visualViewport height", () => {
    stubVisualViewport(800);
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(800);
  });

  it("updates the height on a simulated resize event", () => {
    const { vv, fire } = stubVisualViewport(800);
    const { result } = renderHook(() => useVisualViewportHeight());
    act(() => {
      vv.height = 420;
      fire("resize");
    });
    expect(result.current).toBe(420);
  });

  it("updates the height on a simulated scroll event", () => {
    const { vv, fire } = stubVisualViewport(800);
    const { result } = renderHook(() => useVisualViewportHeight());
    act(() => {
      vv.height = 500;
      fire("scroll");
    });
    expect(result.current).toBe(500);
  });

  it("removes its listeners on unmount", () => {
    const { listeners } = stubVisualViewport(800);
    const { unmount } = renderHook(() => useVisualViewportHeight());
    expect(listeners.resize.length).toBe(1);
    unmount();
    expect(listeners.resize.length).toBe(0);
    expect(listeners.scroll.length).toBe(0);
  });

  it("falls back to window.innerHeight when visualViewport is absent", () => {
    vi.stubGlobal("visualViewport", undefined);
    const original = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { value: 640, configurable: true });
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(640);
    Object.defineProperty(window, "innerHeight", { value: original, configurable: true });
  });
});
