import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReferenceData } from "@/hooks/useReferenceData";
import type { ReferenceData } from "@/types/character";

const fetchReference = vi.fn();
vi.mock("@/api/client", () => ({
  fetchReference: (...args: unknown[]) => fetchReference(...args),
}));

const REFERENCE: ReferenceData = {
  races: [],
  classes: [],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
};

describe("useReferenceData", () => {
  beforeEach(() => {
    fetchReference.mockReset();
  });

  // Pin (green-first): the three states the hook must keep surfacing.
  it("is pending -> {null,false}", () => {
    fetchReference.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReferenceData());
    expect(result.current).toEqual({ reference: null, error: false });
  });

  it("is loaded -> {data,false}", async () => {
    fetchReference.mockResolvedValue(REFERENCE);
    const { result } = renderHook(() => useReferenceData());
    await waitFor(() => expect(result.current.reference).toEqual(REFERENCE));
    expect(result.current.error).toBe(false);
  });

  it("rejects -> {null,true}", async () => {
    fetchReference.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useReferenceData());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.reference).toBeNull();
  });

  // RED: fails against the old hook, which has no cache and fetches on every
  // mount — pins the staleTime: Infinity override (catalog content cannot
  // change mid-session).
  it("fetches reference data once across two mounts", async () => {
    fetchReference.mockResolvedValue(REFERENCE);
    const first = renderHook(() => useReferenceData());
    await waitFor(() => expect(first.result.current.reference).toEqual(REFERENCE));
    first.unmount();

    const second = renderHook(() => useReferenceData());
    await waitFor(() => expect(second.result.current.reference).toEqual(REFERENCE));

    expect(fetchReference).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
