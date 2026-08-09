import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useItemCatalog } from "@/features/inventory/useItemCatalog";
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

  // #1332: catalogKeys.items() is the shared cache entry every /items reader
  // rides — two consumers mounted together must collapse to one network call,
  // not one each. This is the acceptance-criteria test for the whole ticket.
  it("shares one cache entry across two concurrently mounted consumers", async () => {
    const first = renderHook(() => useItemCatalog());
    const second = renderHook(() => useItemCatalog());

    await waitFor(() => expect(first.result.current).toEqual([CLUB]));
    await waitFor(() => expect(second.result.current).toEqual([CLUB]));

    expect(fetchItems).toHaveBeenCalledTimes(1);
  });
});
