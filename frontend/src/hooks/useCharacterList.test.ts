import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCharacterList } from "@/hooks/useCharacterList";
import type { CharacterSummary } from "@/types/character";

const fetchCharacters = vi.fn();
vi.mock("@/api/client", () => ({
  fetchCharacters: (...args: unknown[]) => fetchCharacters(...args),
}));

const SUMMARIES: CharacterSummary[] = [
  { id: "c1", ownerId: "u1", name: "Aldric", race: "Human", class: "Fighter", level: 7 },
];

describe("useCharacterList", () => {
  beforeEach(() => {
    fetchCharacters.mockReset();
  });

  it("is pending -> {null,false}", () => {
    fetchCharacters.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCharacterList());
    expect(result.current).toEqual({ characters: null, error: false });
  });

  it("is loaded -> {data,false}", async () => {
    fetchCharacters.mockResolvedValue(SUMMARIES);
    const { result } = renderHook(() => useCharacterList());
    await waitFor(() => expect(result.current.characters).toEqual(SUMMARIES));
    expect(result.current.error).toBe(false);
  });

  it("rejects -> {null,true}", async () => {
    fetchCharacters.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCharacterList());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.characters).toBeNull();
  });

  // Two consumers (CharacterSwitcherSheet, CharacterListPage) can mount at
  // once and share one request — the cache is the point.
  it("shares one request across two mounted consumers", async () => {
    fetchCharacters.mockResolvedValue(SUMMARIES);
    const first = renderHook(() => useCharacterList());
    const second = renderHook(() => useCharacterList());
    await waitFor(() => expect(first.result.current.characters).toEqual(SUMMARIES));
    await waitFor(() => expect(second.result.current.characters).toEqual(SUMMARIES));

    expect(fetchCharacters).toHaveBeenCalledTimes(1);
  });
});
