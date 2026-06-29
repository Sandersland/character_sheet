import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useDelayedFlag } from "@/hooks/useDelayedFlag";

describe("useDelayedFlag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays false before the delay elapses", () => {
    const { result } = renderHook(() => useDelayedFlag(true, 400));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(result.current).toBe(false);
  });

  it("becomes true once the delay elapses", () => {
    const { result } = renderHook(() => useDelayedFlag(true, 400));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(true);
  });

  it("never trips when active goes false before the delay", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 400),
      { initialProps: { active: true } },
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(false);
  });

  it("resets to false immediately when active goes false after tripping", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 400),
      { initialProps: { active: true } },
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });
});
