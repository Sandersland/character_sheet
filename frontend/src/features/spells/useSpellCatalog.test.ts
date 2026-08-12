import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import * as client from "@/api/client";
import type { CatalogSpell } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSpells: vi.fn(),
}));

const FIREBALL: CatalogSpell = {
  id: "s1",
  name: "Fireball",
  level: 3,
  school: "evocation",
  castingTime: "1 action",
  range: "150 feet",
  duration: "Instantaneous",
  description: "A fiery explosion.",
  concentration: false,
  ritual: false,
  classes: [],
  cantripScaling: false,
};

beforeEach(() => {
  vi.mocked(client.fetchSpells).mockReset();
});

// #1840: catalog and error must never both hold stale values across a
// refreshKey re-fetch.
describe("useSpellCatalog re-fetch state (#1840)", () => {
  it("clears a stale error once a refreshKey re-fetch succeeds", async () => {
    vi.mocked(client.fetchSpells).mockRejectedValueOnce(new Error("network down"));

    const { result, rerender } = renderHook(
      ({ refreshKey }) => useSpellCatalog("EDITION_2024", undefined, refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.error).toBe("Couldn't load spell catalog."));
    expect(result.current.catalog).toBeNull();

    vi.mocked(client.fetchSpells).mockResolvedValueOnce([FIREBALL]);
    rerender({ refreshKey: 1 });

    await waitFor(() => expect(result.current.catalog).toEqual([FIREBALL]));
    expect(result.current.error).toBeNull();
  });

  it("clears the stale catalog once a refreshKey re-fetch fails, with no simultaneous stale success", async () => {
    vi.mocked(client.fetchSpells).mockResolvedValueOnce([FIREBALL]);

    const { result, rerender } = renderHook(
      ({ refreshKey }) => useSpellCatalog("EDITION_2024", undefined, refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.catalog).toEqual([FIREBALL]));
    expect(result.current.error).toBeNull();

    vi.mocked(client.fetchSpells).mockRejectedValueOnce(new Error("network down"));
    rerender({ refreshKey: 1 });

    await waitFor(() => expect(result.current.error).toBe("Couldn't load spell catalog."));
    expect(result.current.catalog).toBeNull();
  });
});
