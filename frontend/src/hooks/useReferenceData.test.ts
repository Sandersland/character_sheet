import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReferenceData } from "@/hooks/useReferenceData";
import type { ReferenceData } from "@/types/character";

const fetchReference = vi.fn();
vi.mock("@/api/client", () => ({
  fetchReference: (...args: unknown[]) => fetchReference(...args),
}));

const REFERENCE: ReferenceData = {
  species: [],
  classes: [],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
  conditions: [],
  universalActions: [],
  itemRarities: [],
  abilityGeneration: {
    standardArray: [15, 14, 13, 12, 10, 8],
    pointBuy: { budget: 27, floor: 8, ceiling: 15, costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } },
    manual: { floor: 1, ceiling: 30 },
  },
};

describe("useReferenceData", () => {
  beforeEach(() => {
    fetchReference.mockReset();
  });

  it("is pending -> {null,false}", () => {
    fetchReference.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReferenceData("EDITION_2024"));
    expect(result.current).toEqual({ reference: null, error: false });
  });

  it("is loaded -> {data,false}", async () => {
    fetchReference.mockResolvedValue(REFERENCE);
    const { result } = renderHook(() => useReferenceData("EDITION_2024"));
    await waitFor(() => expect(result.current.reference).toEqual(REFERENCE));
    expect(result.current.error).toBe(false);
  });

  it("rejects -> {null,true}", async () => {
    fetchReference.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useReferenceData("EDITION_2024"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.reference).toBeNull();
  });

  // Pins the staleTime: Infinity override — catalog content cannot change
  // mid-session, so two mounts share one fetch.
  it("fetches reference data once across two mounts", async () => {
    fetchReference.mockResolvedValue(REFERENCE);
    const first = renderHook(() => useReferenceData("EDITION_2024"));
    await waitFor(() => expect(first.result.current.reference).toEqual(REFERENCE));
    first.unmount();

    const second = renderHook(() => useReferenceData("EDITION_2024"));
    await waitFor(() => expect(second.result.current.reference).toEqual(REFERENCE));

    expect(fetchReference).toHaveBeenCalledTimes(1);
  });

  // Edition is cache IDENTITY, not a filter — a 2014 fetch must never be
  // served to a 2024 mount under one shared cache key.
  it("keeps 2014 and 2024 reference data in separate cache entries", async () => {
    const REF_2014: ReferenceData = { ...REFERENCE, alignments: ["2014"] };
    const REF_2024: ReferenceData = { ...REFERENCE, alignments: ["2024"] };
    fetchReference.mockImplementation((edition: string) =>
      Promise.resolve(edition === "EDITION_2014" ? REF_2014 : REF_2024),
    );

    const a = renderHook(() => useReferenceData("EDITION_2024"));
    await waitFor(() => expect(a.result.current.reference).toEqual(REF_2024));

    const b = renderHook(() => useReferenceData("EDITION_2014"));
    await waitFor(() => expect(b.result.current.reference).toEqual(REF_2014));

    expect(fetchReference).toHaveBeenCalledTimes(2);
  });

  // skipToken (not `enabled`) — a null/undefined edition means the caller
  // (e.g. creation, before CreationEntryGate resolves rulesEdition) doesn't
  // know its edition yet, so the query must stay pending rather than fetching
  // a wrong/default edition.
  it("skips the fetch until an edition is known", () => {
    const { result } = renderHook(() => useReferenceData(null));
    expect(result.current).toEqual({ reference: null, error: false });
    expect(fetchReference).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
