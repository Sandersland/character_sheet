import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

// A single shared, mutable MediaQueryList so subscribe() and getSnapshot() —
// which each call matchMedia() — observe the same object we drive.
function makeMql(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  return {
    matches: initial,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    emit(next: boolean) {
      this.matches = next;
      listeners.forEach((l) => l({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

let mql: ReturnType<typeof makeMql>;
beforeEach(() => {
  mql = makeMql(false);
  vi.stubGlobal("matchMedia", () => mql);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePrefersReducedMotion (#1083)", () => {
  it("returns false when reduce-motion is off", () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when reduce-motion is on", () => {
    mql = makeMql(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("flips when the media query changes", () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => mql.emit(true));
    expect(result.current).toBe(true);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => usePrefersReducedMotion());
    expect(mql.listenerCount()).toBe(1);
    unmount();
    expect(mql.listenerCount()).toBe(0);
  });

  it("degrades to false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
