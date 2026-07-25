import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useClassTransactions } from "@/features/class/useClassTransactions";
import { cachedCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

const updated = { id: "char-1" } as unknown as Character;

describe("useClassTransactions", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useClassTransactions("char-1"));
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("toggles busy and writes the result into the character cache on success", async () => {
    const { result } = renderHook(() => useClassTransactions("char-1"));

    let resolve!: (c: Character) => void;
    const pending = new Promise<Character>((r) => { resolve = r; });

    act(() => { void result.current.run(() => pending); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => { resolve(updated); await pending; });

    // A mutation's success dispatch is notified via TanStack Query's internal
    // batching (a microtask hop beyond `run`'s own await), so these need a tick.
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(cachedCharacter("char-1")).toEqual(updated);
    expect(result.current.error).toBeNull();
  });

  it("captures the error message and clears busy on failure", async () => {
    const { result } = renderHook(() => useClassTransactions("char-1"));

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("boom")));
    });

    expect(cachedCharacter("char-1")).toBeUndefined();
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.busy).toBe(false);
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    const { result } = renderHook(() => useClassTransactions("char-1"));
    await act(async () => {
      await result.current.run(() => Promise.reject("nope"));
    });
    await waitFor(() => expect(result.current.error).toBe("Something went wrong."));
  });

  it("clears a prior error on the next successful run", async () => {
    const { result } = renderHook(() => useClassTransactions("char-1"));
    await act(async () => { await result.current.run(() => Promise.reject(new Error("boom"))); });
    await waitFor(() => expect(result.current.error).toBe("boom"));
    await act(async () => { await result.current.run(() => Promise.resolve(updated)); });
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
