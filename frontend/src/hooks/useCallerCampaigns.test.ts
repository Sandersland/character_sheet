import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useCallerCampaigns } from "@/hooks/useCallerCampaigns";
import * as client from "@/api/client";
import type { Campaign } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
}));

const CAMPAIGN: Campaign = {
  id: "camp-a",
  name: "The Sunless Citadel",
  ownerId: "u1",
  rulesEdition: "EDITION_2014",
  rulesEditionLabel: "2014",
  inviteCode: "ABC123",
  createdAt: "2024-01-01T00:00:00.000Z",
  members: [],
  role: "OWNER",
};

describe("useCallerCampaigns", () => {
  beforeEach(() => {
    vi.mocked(client.fetchCampaigns).mockReset();
  });

  it("resolves the caller's campaigns", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([CAMPAIGN]);

    const { result } = renderHook(() => useCallerCampaigns());

    expect(result.current.campaigns).toBeNull();
    await waitFor(() => expect(result.current.campaigns).toEqual([CAMPAIGN]));
    expect(result.current.error).toBeNull();
  });

  it("surfaces a load error", async () => {
    vi.mocked(client.fetchCampaigns).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useCallerCampaigns());

    await waitFor(() => expect(result.current.error).toBe("Couldn't load your campaigns."));
    expect(result.current.campaigns).toBeNull();
  });
});
