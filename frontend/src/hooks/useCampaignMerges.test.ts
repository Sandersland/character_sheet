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

  // Pin (green-first): no campaignId.
  it("no campaignId -> [], fetchEntityMerges never called", () => {
    const { result } = renderHook(() => useCampaignMerges(null));
    expect(result.current.merges).toEqual([]);
    expect(fetchEntityMerges).not.toHaveBeenCalled();
  });

  // Pin (green-first): success -> list.
  it("success -> the fetched list", async () => {
    const list = [merge({ id: "m1" })];
    fetchEntityMerges.mockResolvedValue(list);
    const { result } = renderHook(() => useCampaignMerges("camp-1"));
    await waitFor(() => expect(result.current.merges).toEqual(list));
  });

  // Pin (green-first): the fanout the reveal banner / Manage tab depend on.
  it("a primeCampaignMerges call is seen by an already-mounted consumer", async () => {
    fetchEntityMerges.mockResolvedValue([]);
    const { result } = renderHook(() => useCampaignMerges("camp-1"));
    await waitFor(() => expect(fetchEntityMerges).toHaveBeenCalledTimes(1));

    const created = [merge({ id: "m1" })];
    primeCampaignMerges("camp-1", created);

    await waitFor(() => expect(result.current.merges).toEqual(created));
  });

  // RED: same identity-churn class as useCampaignEntities — pins the module-level
  // NONE constant.
  it("merges keeps the same identity across re-renders when nothing changed", () => {
    const { result, rerender } = renderHook(() => useCampaignMerges(null));
    const before = result.current.merges;
    rerender();
    expect(result.current.merges).toBe(before);
  });

  // Pin (green-first): two consumers mounting together share one request.
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
});
