import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useCombatPoll } from "@/features/session/useCombatPoll";
import { fetchCombatState } from "@/api/client";

vi.mock("@/api/client", () => ({ fetchCombatState: vi.fn() }));

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useCombatPoll (#1030)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchCombatState).mockResolvedValue({ round: 2, combatActive: true, updatedAt: "x" });
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("polls immediately on mount, then every 5s, while active and a session is live", async () => {
    const onSync = vi.fn();
    renderHook(() => useCombatPoll("char-1", "sess-1", true, onSync));

    await vi.waitFor(() => expect(fetchCombatState).toHaveBeenCalledTimes(1));
    expect(fetchCombatState).toHaveBeenCalledWith("char-1", "sess-1");
    await vi.waitFor(() => expect(onSync).toHaveBeenCalledWith(2, true));

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCombatState).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCombatState).toHaveBeenCalledTimes(3);
  });

  it("does not poll when active is false", async () => {
    renderHook(() => useCombatPoll("char-1", "sess-1", false, vi.fn()));

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchCombatState).not.toHaveBeenCalled();
  });

  it("does not poll when sessionId is null", async () => {
    renderHook(() => useCombatPoll("char-1", null, true, vi.fn()));

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchCombatState).not.toHaveBeenCalled();
  });

  it("stops polling while the tab is hidden and resumes when it's shown again", async () => {
    const onSync = vi.fn();
    renderHook(() => useCombatPoll("char-1", "sess-1", true, onSync));
    await vi.waitFor(() => expect(fetchCombatState).toHaveBeenCalledTimes(1));

    setHidden(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchCombatState).toHaveBeenCalledTimes(1); // no new calls while hidden

    setHidden(false);
    await vi.waitFor(() => expect(fetchCombatState).toHaveBeenCalledTimes(2));
  });

  it("clears the interval on unmount — no further calls land", async () => {
    const { unmount } = renderHook(() => useCombatPoll("char-1", "sess-1", true, vi.fn()));
    await vi.waitFor(() => expect(fetchCombatState).toHaveBeenCalledTimes(1));

    unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchCombatState).toHaveBeenCalledTimes(1);
  });

  it("a failed poll is swallowed — it does not throw and does not stop future ticks", async () => {
    vi.mocked(fetchCombatState).mockRejectedValueOnce(new Error("network blip"));
    const onSync = vi.fn();
    renderHook(() => useCombatPoll("char-1", "sess-1", true, onSync));

    await vi.waitFor(() => expect(fetchCombatState).toHaveBeenCalledTimes(1));
    expect(onSync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(fetchCombatState).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(onSync).toHaveBeenCalledWith(2, true));
  });
});
