import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { RulesEdition } from "@character-sheet/shared-types";

import { useShadowArtsCatalog } from "@/features/class/useShadowArtsCatalog";
import * as client from "@/api/client";
import type { CatalogShadowArt } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchShadowArts: vi.fn() }));

const CATALOG: CatalogShadowArt[] = [
  {
    id: "darkness",
    name: "Shadow Arts: Darkness",
    description: "Cast darkness.",
    minLevel: 3,
    cost: { kind: "pool", key: "focus", base: 1 },
    effect: {
      effectType: "utility",
      damageType: null,
      attackType: null,
      saveAbility: null,
      saveEffect: null,
      scaling: { mode: "none" },
      concentration: true,
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useShadowArtsCatalog (#1738)", () => {
  it("starts with catalog null and no error, then resolves the fetched rows", async () => {
    vi.mocked(client.fetchShadowArts).mockResolvedValue(CATALOG);
    const { result } = renderHook(() => useShadowArtsCatalog("EDITION_2024"));

    expect(result.current.catalog).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.catalog).toEqual(CATALOG));
    expect(client.fetchShadowArts).toHaveBeenCalledWith("EDITION_2024");
  });

  it("surfaces a load error", async () => {
    vi.mocked(client.fetchShadowArts).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useShadowArtsCatalog("EDITION_2014"));

    await waitFor(() => expect(result.current.error).toBe("Couldn't load Shadow Arts."));
    expect(result.current.catalog).toBeNull();
  });

  it("retry() re-fetches and clears a prior error on success — no reload required", async () => {
    vi.mocked(client.fetchShadowArts).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useShadowArtsCatalog("EDITION_2024"));
    await waitFor(() => expect(result.current.error).toBe("Couldn't load Shadow Arts."));

    vi.mocked(client.fetchShadowArts).mockResolvedValueOnce(CATALOG);
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.catalog).toEqual(CATALOG));
    expect(result.current.error).toBeNull();
    expect(client.fetchShadowArts).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when rulesEdition changes", async () => {
    vi.mocked(client.fetchShadowArts).mockResolvedValue(CATALOG);
    const { rerender } = renderHook(({ edition }: { edition: RulesEdition }) => useShadowArtsCatalog(edition), {
      initialProps: { edition: "EDITION_2024" },
    });
    await waitFor(() => expect(client.fetchShadowArts).toHaveBeenCalledWith("EDITION_2024"));

    rerender({ edition: "EDITION_2014" });
    await waitFor(() => expect(client.fetchShadowArts).toHaveBeenCalledWith("EDITION_2014"));
  });
});
