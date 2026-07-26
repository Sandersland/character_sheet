import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { useCharacter } from "@/hooks/useCharacter";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

const fetchCharacter = vi.fn();
vi.mock("@/api/client", () => ({
  fetchCharacter: (...args: unknown[]) => fetchCharacter(...args),
}));

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "c1", name: "Aldric", campaignId: null, journal: [], ...over } as unknown as Character;
}

describe("useCharacterMutation", () => {
  beforeEach(() => {
    fetchCharacter.mockReset();
  });

  // GENUINE RED (plan §4/§9.1): without `scope`, useMutation runs concurrently.
  // Request A (the HP "damage" click) is issued first but its response is
  // slower; request B (the very next click) is issued second but resolves
  // faster. Without scope both mutationFns fire immediately, so B's fast
  // response lands first and A's slow, STALE response overwrites it last —
  // exactly the "spam the HP buttons" bug (AC). `scope` fixes this by never
  // starting B's mutationFn until A's has fully settled, so completion order
  // always matches request order regardless of each call's own latency.
  it("out-of-order responses still leave the SECOND request's character in the cache (mutation scope)", async () => {
    const mutationFn = vi.fn(
      (vars: { tag: "A" | "B" }) =>
        new Promise<Character>((resolve) => {
          const delayMs = vars.tag === "A" ? 30 : 0; // A: issued first, resolves slower.
          setTimeout(() => resolve(makeCharacter({ name: `${vars.tag}-response` })), delayMs);
        }),
    );

    const { result } = renderHook(() =>
      useCharacterMutation<{ tag: "A" | "B" }, Character>({
        characterId: "c1",
        mutationFn,
        toCharacter: (c) => c,
        fallbackMessage: "failed",
      }),
    );

    act(() => {
      result.current.mutate({ tag: "A" }); // request 1
    });
    act(() => {
      result.current.mutate({ tag: "B" }); // request 2, issued second
    });

    await waitFor(() => {
      const cached = getQueryClient().getQueryData<Character>(characterKeys.detail("c1"));
      expect(cached?.name).toBe("B-response");
    });
  });

  // GENUINE RED (plan §1/§9.3): shape C is `Character & { results }` — an
  // intersection, so `(r) => r` type-checks but writes `results`/`batchId` into
  // the cached character. `toCharacter` must strip them explicitly.
  it("strips extra keys from an intersection response (shape C) before caching", async () => {
    type IntersectionResult = Character & { results: unknown[]; batchId?: string };
    const response: IntersectionResult = {
      ...makeCharacter(),
      results: [{ roll: 7 }],
      batchId: "batch-1",
    };
    const mutationFn = vi.fn().mockResolvedValue(response);

    const { result } = renderHook(() =>
      useCharacterMutation<void, IntersectionResult>({
        characterId: "c1",
        mutationFn,
        toCharacter: ({ results, batchId, ...character }) => {
          void results;
          void batchId;
          return character;
        },
        fallbackMessage: "failed",
      }),
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    const cached = getQueryClient().getQueryData<Record<string, unknown>>(characterKeys.detail("c1"));
    expect(cached).not.toHaveProperty("results");
    expect(cached).not.toHaveProperty("batchId");
  });

  // New coverage (plan §9): the cache write is authoritative — no mutation
  // should ever trigger a character refetch on success.
  it("does not refetch the character on success", async () => {
    fetchCharacter.mockResolvedValue(makeCharacter());
    const { result: characterResult } = renderHook(() => useCharacter("c1"));
    await waitFor(() => expect(characterResult.current.character).not.toBeUndefined());
    expect(fetchCharacter).toHaveBeenCalledTimes(1);

    const mutationFn = vi.fn().mockResolvedValue(makeCharacter({ name: "Aldric the Bold" }));
    const { result: mutationResult } = renderHook(() =>
      useCharacterMutation<void, Character>({
        characterId: "c1",
        mutationFn,
        toCharacter: (c) => c,
        fallbackMessage: "failed",
      }),
    );

    act(() => {
      mutationResult.current.mutate(undefined);
    });
    await waitFor(() => expect(characterResult.current.character?.name).toBe("Aldric the Bold"));
    expect(fetchCharacter).toHaveBeenCalledTimes(1); // still just the initial load
  });

  // Pin: a mutation failure surfaces the fallback message when the thrown
  // value isn't an Error (mirrors errorMessage()'s own contract).
  it("surfaces the fallback message on a non-Error rejection", async () => {
    const mutationFn = vi.fn().mockRejectedValue("nope");
    const { result } = renderHook(() =>
      useCharacterMutation<void, Character>({
        characterId: "c1",
        mutationFn,
        toCharacter: (c) => c,
        fallbackMessage: "Something went wrong.",
      }),
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => expect(result.current.error).toBe("Something went wrong."));
  });

  // Pin: onCharacterWritten receives the raw TResult (not the narrowed
  // Character) so callers can still read `results`/`concentrationChecks`/etc.
  it("onCharacterWritten fires with the raw result after a successful write", async () => {
    const response = { character: makeCharacter(), results: [{ roll: 3 }] };
    const mutationFn = vi.fn().mockResolvedValue(response);
    const onCharacterWritten = vi.fn();

    const { result } = renderHook(() =>
      useCharacterMutation<void, typeof response>({
        characterId: "c1",
        mutationFn,
        toCharacter: (r) => r.character,
        fallbackMessage: "failed",
        onCharacterWritten,
      }),
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => expect(onCharacterWritten).toHaveBeenCalledWith(response));
  });
});
