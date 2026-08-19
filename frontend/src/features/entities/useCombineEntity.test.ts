import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { combineEntities } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { campaignKeys } from "@/api/queryKeys";
import { useCombineEntity } from "@/features/entities/useCombineEntity";
import type { CampaignEntity } from "@/types/character";

vi.mock("@/api/client", () => ({ combineEntities: vi.fn() }));

const CAMPAIGN_ID = "camp-1";
const survivor: CampaignEntity = {
  id: "surv-1",
  campaignId: CAMPAIGN_ID,
  type: "NPC",
  name: "Lili",
  aliases: [],
  notes: null,
  visibility: "REVEALED",
  createdAt: "",
  updatedAt: "",
};

describe("useCombineEntity (#1943)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryClient().setQueryData(campaignKeys.entities(CAMPAIGN_ID), [survivor]);
    getQueryClient().setQueryData(campaignKeys.merges(CAMPAIGN_ID), []);
  });

  it("calls combineEntities with the duplicate and chosen survivor", async () => {
    vi.mocked(combineEntities).mockResolvedValue(survivor);
    const { result } = renderHook(() => useCombineEntity(CAMPAIGN_ID));

    act(() => {
      result.current.mutate({ duplicateId: "dup-1", survivorId: "surv-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(combineEntities)).toHaveBeenCalledWith(CAMPAIGN_ID, "surv-1", ["dup-1"]);
  });

  it("invalidates the entities and merges caches on success", async () => {
    vi.mocked(combineEntities).mockResolvedValue(survivor);
    const { result } = renderHook(() => useCombineEntity(CAMPAIGN_ID));

    act(() => {
      result.current.mutate({ duplicateId: "dup-1", survivorId: "surv-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      getQueryClient().getQueryState(campaignKeys.entities(CAMPAIGN_ID))?.isInvalidated,
    ).toBe(true);
    expect(
      getQueryClient().getQueryState(campaignKeys.merges(CAMPAIGN_ID))?.isInvalidated,
    ).toBe(true);
  });

  it("surfaces the backend's error message on a 409 conflict", async () => {
    vi.mocked(combineEntities).mockRejectedValue(new Error("Both entities are linked to a character"));
    const { result } = renderHook(() => useCombineEntity(CAMPAIGN_ID));

    act(() => {
      result.current.mutate({ duplicateId: "dup-1", survivorId: "surv-1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Both entities are linked to a character");
  });
});
