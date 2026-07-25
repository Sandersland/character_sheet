import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { useCharacter } from "@/hooks/useCharacter";
import type { Character } from "@/types/character";

const fetchCharacter = vi.fn();
vi.mock("@/api/client", () => ({
  fetchCharacter: (...args: unknown[]) => fetchCharacter(...args),
}));

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "c1", name: "Aldric", campaignId: null, journal: [], ...over } as unknown as Character;
}

describe("useCharacter", () => {
  beforeEach(() => {
    fetchCharacter.mockReset();
  });

  describe("tri-state (pin, green-first)", () => {
    it("unresolved -> character undefined", () => {
      fetchCharacter.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useCharacter("c1"));
      expect(result.current.character).toBeUndefined();
      expect(result.current.error).toBe(false);
    });

    it("resolves null (404/403) -> character null, error false", async () => {
      fetchCharacter.mockResolvedValue(null);
      const { result } = renderHook(() => useCharacter("c1"));
      await waitFor(() => expect(result.current.character).toBeNull());
      expect(result.current.error).toBe(false);
    });

    it("resolves an object -> character is that object", async () => {
      const character = makeCharacter();
      fetchCharacter.mockResolvedValue(character);
      const { result } = renderHook(() => useCharacter("c1"));
      await waitFor(() => expect(result.current.character).toEqual(character));
    });
  });

  // Pin (green-first): rejection.
  it("rejection -> error true, character undefined", async () => {
    fetchCharacter.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCharacter("c1"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.character).toBeUndefined();
  });

  // Pin (green-first): no id.
  it("no id -> stays undefined, error false, fetchCharacter never called", () => {
    const { result } = renderHook(() => useCharacter(undefined));
    expect(result.current).toMatchObject({ character: undefined, error: false });
    expect(fetchCharacter).not.toHaveBeenCalled();
  });

  // RED: fails against a naive local-state hook (each mount owns its own
  // state) — the property #1284's cache-write mutations are built on.
  it("setCharacter is visible to a second consumer of the same id", async () => {
    const character = makeCharacter();
    fetchCharacter.mockResolvedValue(character);
    const first = renderHook(() => useCharacter("c1"));
    const second = renderHook(() => useCharacter("c1"));
    await waitFor(() => expect(first.result.current.character).toEqual(character));
    await waitFor(() => expect(second.result.current.character).toEqual(character));

    const updated = makeCharacter({ name: "Aldric the Bold" });
    act(() => first.result.current.setCharacter(updated));

    await waitFor(() => expect(second.result.current.character).toEqual(updated));
  });

  // RED: fails against a naive un-memoised closure — the regression that
  // would silently re-fire useCombatLifecycle's effect deep in the sheet
  // (setCharacter is threaded into its deps as onUpdate).
  it("setCharacter identity is stable across re-renders", async () => {
    fetchCharacter.mockResolvedValue(makeCharacter());
    const { result, rerender } = renderHook(() => useCharacter("c1"));
    await waitFor(() => expect(result.current.character).not.toBeUndefined());
    const before = result.current.setCharacter;
    rerender();
    expect(result.current.setCharacter).toBe(before);
  });

  // RED (new behaviour, deliberate): not expressible against the old hook —
  // it has no refetch. Pins the `isError && data === undefined` guard that
  // stops a transient background-refetch blip from replacing a working sheet
  // with CharacterLoadError.
  it("a failed background refetch keeps the loaded character and does not raise error", async () => {
    const character = makeCharacter();
    fetchCharacter.mockResolvedValueOnce(character);
    const { result } = renderHook(() => useCharacter("c1"));
    await waitFor(() => expect(result.current.character).toEqual(character));

    fetchCharacter.mockRejectedValueOnce(new Error("network blip"));
    await act(async () => {
      await getQueryClient().refetchQueries({ queryKey: characterKeys.detail("c1") });
    });

    expect(result.current.character).toEqual(character);
    expect(result.current.error).toBe(false);
  });

  // RED: pins the 30s staleTime choice — a remount inside that window must
  // not re-fetch a character already in the cache.
  it("a remount within staleTime does not refetch", async () => {
    fetchCharacter.mockResolvedValue(makeCharacter());
    const first = renderHook(() => useCharacter("c1"));
    await waitFor(() => expect(first.result.current.character).not.toBeUndefined());
    first.unmount();

    const second = renderHook(() => useCharacter("c1"));
    await waitFor(() => expect(second.result.current.character).not.toBeUndefined());

    expect(fetchCharacter).toHaveBeenCalledTimes(1);
  });
});
