import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useItemCatalog } from "@/hooks/useItemCatalog";
import type { Item } from "@/types/character";

const fetchItems = vi.fn();
vi.mock("@/api/client", () => ({
  fetchItems: (...args: unknown[]) => fetchItems(...args),
}));

const CLUB: Item = { id: "i1", name: "Club", category: "weapon" } as Item;

beforeEach(() => {
  fetchItems.mockReset().mockResolvedValue([CLUB]);
});

describe("useItemCatalog", () => {
  it("returns the resolved catalog", async () => {
    const { result } = renderHook(() => useItemCatalog());
    await waitFor(() => expect(result.current).toEqual([CLUB]));
  });

  it("returns an empty list when the fetch rejects", async () => {
    fetchItems.mockReset().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useItemCatalog());
    await waitFor(() => expect(fetchItems).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  // Mounted only after the first resolves: catalogKeys.items() is the shared
  // cache entry every /items reader rides. TanStack dedupes simultaneous
  // in-flight requests to the same key regardless of staleTime, so mounting
  // concurrently wouldn't prove the staleTime: Infinity cache hit this test
  // targets.
  it("serves a second consumer mounted after the first resolves from cache, with no second fetch", async () => {
    const first = renderHook(() => useItemCatalog());
    await waitFor(() => expect(first.result.current).toEqual([CLUB]));
    expect(fetchItems).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useItemCatalog());
    expect(second.result.current).toEqual([CLUB]);
    expect(fetchItems).toHaveBeenCalledTimes(1);
  });
});
