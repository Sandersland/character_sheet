import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { CurrentCharacterProvider, useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { Character } from "@/types/character";

// useCurrentCharacter is built on useCharacter(id), which calls fetchCharacter
// when the cache is empty — stub it so an unseeded id doesn't hit the network.
const fetchCharacter = vi.fn();
vi.mock("@/api/client", () => ({
  fetchCharacter: (...args: unknown[]) => fetchCharacter(...args),
}));

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "c1", name: "Aldric", campaignId: null, journal: [], ...over } as unknown as Character;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <CurrentCharacterProvider id="c1">{children}</CurrentCharacterProvider>;
}

describe("useCurrentCharacter", () => {
  // GENUINE RED (plan §8.2): no provider mounted at all.
  it("throws outside a CurrentCharacterProvider", () => {
    expect(() => renderHook(() => useCurrentCharacter())).toThrow(
      /useCurrentCharacter must be used inside/,
    );
  });

  // GENUINE RED (plan §8.1): a cache write (the same path a mutation's
  // onSuccess uses) must reach every consumer via the query observer, not a
  // one-shot getQueryData read.
  it("re-renders its consumer when the character cache is written", async () => {
    getQueryClient().setQueryData(characterKeys.detail("c1"), makeCharacter());
    const { result } = renderHook(() => useCurrentCharacter(), { wrapper });
    await waitFor(() => expect(result.current.character.name).toBe("Aldric"));

    getQueryClient().setQueryData(characterKeys.detail("c1"), makeCharacter({ name: "Aldric the Bold" }));

    await waitFor(() => expect(result.current.character.name).toBe("Aldric the Bold"));
  });

  // Pin: TanStack Query's structural sharing keeps the OLD reference when a
  // write is deeply equal to what's cached — a consumer memoised on identity
  // must not re-render for a no-op write.
  it("an identical write keeps the same character reference (structural sharing)", async () => {
    const character = makeCharacter();
    getQueryClient().setQueryData(characterKeys.detail("c1"), character);
    const { result } = renderHook(() => useCurrentCharacter(), { wrapper });
    await waitFor(() => expect(result.current.character).toBeDefined());
    const before = result.current.character;

    getQueryClient().setQueryData(characterKeys.detail("c1"), makeCharacter());

    await waitFor(() => expect(result.current.character).toBe(before));
  });

  // Pin: the provider is only ever mounted below a loaded guard (CharacterSheetPage
  // et al.) — an absent character at that point is a wiring bug, not a loading state.
  it("throws when the character is absent", () => {
    fetchCharacter.mockReturnValue(new Promise(() => {})); // never resolves -> character stays undefined
    expect(() => renderHook(() => useCurrentCharacter(), { wrapper })).toThrow(
      /character is absent/,
    );
  });

  // Pin: a cache write (the path every useCharacterMutation's onSuccess uses)
  // must reach every consumer of the same id, not just whichever component
  // triggered the mutation.
  it("a cache write is visible to a second consumer of the same id", async () => {
    getQueryClient().setQueryData(characterKeys.detail("c1"), makeCharacter());
    const first = renderHook(() => useCurrentCharacter(), { wrapper });
    const second = renderHook(() => useCurrentCharacter(), { wrapper });
    await waitFor(() => expect(first.result.current.character.name).toBe("Aldric"));
    await waitFor(() => expect(second.result.current.character.name).toBe("Aldric"));

    const updated = makeCharacter({ name: "Aldric the Bold" });
    getQueryClient().setQueryData(characterKeys.detail("c1"), updated);

    await waitFor(() => expect(second.result.current.character).toEqual(updated));
  });
});
