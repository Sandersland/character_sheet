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

  // Without `scope`, useMutation runs mutations concurrently, so a slower-
  // resolving earlier request (A) can overwrite a faster-resolving later one
  // (B) — last RESPONSE wins instead of last REQUEST. `scope` serializes
  // same-character mutations so completion order matches request order.
  it("out-of-order responses still leave the SECOND request's character in the cache (mutation scope)", async () => {
    const mutationFn = vi.fn(
      (vars: { tag: "A" | "B" }) =>
        new Promise<Character>((resolve) => {
          const delayMs = vars.tag === "A" ? 30 : 0;
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
      result.current.mutate({ tag: "A" });
    });
    act(() => {
      result.current.mutate({ tag: "B" });
    });

    await waitFor(() => {
      const cached = getQueryClient().getQueryData<Character>(characterKeys.detail("c1"));
      expect(cached?.name).toBe("B-response");
    });
  });

  // Shape C is `Character & { results }` — an intersection, so `(r) => r`
  // type-checks but writes `results`/`batchId` into the cached character;
  // toCharacter must strip them explicitly.
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

  // The cache write is authoritative — no mutation should ever trigger a
  // character refetch on success.
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
    expect(fetchCharacter).toHaveBeenCalledTimes(1);
  });

  // A mutation failure surfaces the fallback message when the thrown value
  // isn't an Error (mirrors errorMessage()'s own contract).
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

  // onCharacterWritten receives the raw TResult (not the narrowed Character)
  // so callers can still read `results`/`concentrationChecks`/etc.
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
