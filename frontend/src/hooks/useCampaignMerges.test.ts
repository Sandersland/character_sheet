import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { campaignKeys } from "@/api/queryKeys";
import { primeCampaignMerges, useCampaignMerges } from "@/hooks/useCampaignMerges";
import type { CampaignEntityMerge } from "@/types/character";

const fetchEntityMerges = vi.fn();
vi.mock("@/api/client", () => ({
  fetchEntityMerges: (...args: unknown[]) => fetchEntityMerges(...args),
}));

function merge(over: Partial<CampaignEntityMerge> & { id: string }): CampaignEntityMerge {
  return {
    campaignId: "camp-1",
    mergedEntityId: "e1",
    survivorEntityId: "e2",
    status: "EXECUTED",
    note: null,
    preparedAt: "",
    executedAt: null,
    ...over,
  } as CampaignEntityMerge;
}

describe("useCampaignMerges", () => {
  beforeEach(() => {
    fetchEntityMerges.mockReset();
  });

  it("no campaignId -> [], fetchEntityMerges never called", () => {
    const { result } = renderHook(() => useCampaignMerges(null));
    expect(result.current.merges).toEqual([]);
    expect(fetchEntityMerges).not.toHaveBeenCalled();
  });

  it("success -> the fetched list", async () => {
    const list = [merge({ id: "m1" })];
    fetchEntityMerges.mockResolvedValue(list);
    const { result } = renderHook(() => useCampaignMerges("camp-1"));
    await waitFor(() => expect(result.current.merges).toEqual(list));
  });

  // primeCampaignMerges must reach an already-mounted consumer (reveal
  // banner, Manage tab).
  it("a primeCampaignMerges call is seen by an already-mounted consumer", async () => {
    fetchEntityMerges.mockResolvedValue([]);
    const { result } = renderHook(() => useCampaignMerges("camp-1"));
    await waitFor(() => expect(fetchEntityMerges).toHaveBeenCalledTimes(1));

    const created = [merge({ id: "m1" })];
    primeCampaignMerges("camp-1", created);

    await waitFor(() => expect(result.current.merges).toEqual(created));
  });

  // Pins the module-level NONE constant (same identity-churn class as
  // useCampaignEntities).
  it("merges keeps the same identity across re-renders when nothing changed", () => {
    const { result, rerender } = renderHook(() => useCampaignMerges(null));
    const before = result.current.merges;
    rerender();
    expect(result.current.merges).toBe(before);
  });

  // Two consumers mounting together share one request (TanStack Query dedupe).
  it("two consumers mounting together issue one fetchEntityMerges call", async () => {
    fetchEntityMerges.mockResolvedValue([]);
    const first = renderHook(() => useCampaignMerges("camp-1"));
    const second = renderHook(() => useCampaignMerges("camp-1"));
    await waitFor(() => expect(first.result.current.merges).toEqual([]));
    await waitFor(() => expect(second.result.current.merges).toEqual([]));

    expect(fetchEntityMerges).toHaveBeenCalledTimes(1);
  });

  it("primeCampaignMerges and the hook resolve the same QueryClient instance", async () => {
    fetchEntityMerges.mockResolvedValue([]);
    renderHook(() => useCampaignMerges("camp-1"));
    const created = [merge({ id: "m1" })];
    primeCampaignMerges("camp-1", created);

    expect(getQueryClient().getQueryData(campaignKeys.merges("camp-1"))).toEqual(created);
  });

  it("isPending is true while the fetch is in flight, false once it resolves (#1949: a caller gating completeness on isLoading alone can't see this)", async () => {
    let resolve!: (v: CampaignEntityMerge[]) => void;
    fetchEntityMerges.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useCampaignMerges("camp-1"));

    expect(result.current.isPending).toBe(true);

    resolve([]);
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("isError surfaces a fetch rejection even though `merges` itself still falls back to []", async () => {
    fetchEntityMerges.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCampaignMerges("camp-1"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.merges).toEqual([]);
  });
});
