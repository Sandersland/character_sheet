import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { campaignKeys } from "@/api/queryKeys";
import { useReviewClusterEntities } from "@/features/inbox/useReviewClusterEntities";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

const fetchEntities = vi.fn();
const fetchEntityMerges = vi.fn();
vi.mock("@/api/client", () => ({
  fetchEntities: (...args: unknown[]) => fetchEntities(...args),
  fetchEntityMerges: (...args: unknown[]) => fetchEntityMerges(...args),
}));

describe("useReviewClusterEntities", () => {
  beforeEach(() => {
    fetchEntities.mockReset();
    fetchEntityMerges.mockReset();
    getQueryClient().clear();
  });

  it("fetches entities WITH stats and the campaign's merges", async () => {
    const entities: CampaignEntity[] = [];
    const merges: CampaignEntityMerge[] = [];
    fetchEntities.mockResolvedValue(entities);
    fetchEntityMerges.mockResolvedValue(merges);

    const { result } = renderHook(() => useReviewClusterEntities("camp-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchEntities).toHaveBeenCalledWith("camp-1", { includeStats: true });
    expect(fetchEntityMerges).toHaveBeenCalledWith("camp-1");
    expect(result.current.entities).toBe(entities);
    expect(result.current.merges).toBe(merges);
  });

  it("shares useCampaignMerges' own cache entry — a pre-primed merges cache is read straight off, no fetch", async () => {
    fetchEntities.mockResolvedValue([]);
    const primed: CampaignEntityMerge[] = [
      {
        id: "m1",
        campaignId: "camp-1",
        mergedEntityId: "e1",
        survivorEntityId: "e2",
        status: "PREPARED",
        note: null,
        preparedAt: "",
        executedAt: null,
      },
    ];
    getQueryClient().setQueryData(campaignKeys.merges("camp-1"), primed);

    const { result } = renderHook(() => useReviewClusterEntities("camp-1"));

    await waitFor(() => expect(result.current.merges).toEqual(primed));
    expect(fetchEntityMerges).not.toHaveBeenCalled();
  });
});
