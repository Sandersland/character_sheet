import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { awardCampaignItem, revokeCampaignItem } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { useCampaignItemMutations } from "@/features/entities/useCampaignItemMutations";
import type { CampaignItem } from "@/types/character";

vi.mock("@/api/client", () => ({
  awardCampaignItem: vi.fn(),
  revokeCampaignItem: vi.fn(),
  createCampaignItem: vi.fn(),
  updateCampaignItem: vi.fn(),
  deleteCampaignItem: vi.fn(),
  updateEntity: vi.fn(),
}));

vi.mock("@/hooks/useCampaignEntities", () => ({ primeCampaignEntities: vi.fn() }));

const baseItem: CampaignItem = {
  id: "item-1",
  campaignId: "camp-1",
  name: "Flametongue",
  category: "weapon",
  requiresAttunement: false,
  isUnique: false,
  holders: [],
  entity: { id: "ent-1", name: "Flametongue", visibility: "HIDDEN" },
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
};

// A DM item award/revoke also touches the recipient's character, not just the
// items list — invalidate rather than assume, or a stale sheet lingers (#1283).
describe("useCampaignItemMutations recipient-character invalidation (#1299 review)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryClient().setQueryData(characterKeys.detail("c1"), { id: "c1", name: "stale" });
  });

  it("invalidates the awarded character's cache on award", async () => {
    vi.mocked(awardCampaignItem).mockResolvedValue({
      holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }],
    });
    const { result } = renderHook(() => useCampaignItemMutations("camp-1", []));

    act(() => {
      result.current.awardMutation.mutate({ item: baseItem, characterId: "c1" });
    });

    await waitFor(() => expect(result.current.awardMutation.isPending).toBe(false));
    expect(
      getQueryClient().getQueryState(characterKeys.detail("c1"))?.isInvalidated,
    ).toBe(true);
  });

  it("invalidates the revoked character's cache on revoke", async () => {
    vi.mocked(revokeCampaignItem).mockResolvedValue({ holders: [] });
    const { result } = renderHook(() => useCampaignItemMutations("camp-1", []));

    act(() => {
      result.current.revokeMutation.mutate({ item: baseItem, characterId: "c1" });
    });

    await waitFor(() => expect(result.current.revokeMutation.isPending).toBe(false));
    expect(
      getQueryClient().getQueryState(characterKeys.detail("c1"))?.isInvalidated,
    ).toBe(true);
  });
});
