import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useClassTransactions } from "@/features/class/useClassTransactions";
import type { Character } from "@/types/character";

const updated = { id: "char-1" } as unknown as Character;

describe("useClassTransactions", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useClassTransactions(vi.fn()));
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("toggles busy and propagates the result on success", async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useClassTransactions(onUpdate));

    let resolve!: (c: Character) => void;
    const pending = new Promise<Character>((r) => { resolve = r; });

    act(() => { void result.current.run(() => pending); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => { resolve(updated); await pending; });

    expect(onUpdate).toHaveBeenCalledWith(updated);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("captures the error message and clears busy on failure", async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useClassTransactions(onUpdate));

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("boom")));
    });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(result.current.error).toBe("boom");
    expect(result.current.busy).toBe(false);
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    const { result } = renderHook(() => useClassTransactions(vi.fn()));
    await act(async () => {
      await result.current.run(() => Promise.reject("nope"));
    });
    expect(result.current.error).toBe("Something went wrong.");
  });

  it("clears a prior error on the next successful run", async () => {
    const { result } = renderHook(() => useClassTransactions(vi.fn()));
    await act(async () => { await result.current.run(() => Promise.reject(new Error("boom"))); });
    expect(result.current.error).toBe("boom");
    await act(async () => { await result.current.run(() => Promise.resolve(updated)); });
    expect(result.current.error).toBeNull();
  });
});
