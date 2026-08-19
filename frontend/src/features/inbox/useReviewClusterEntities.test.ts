import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
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
});
