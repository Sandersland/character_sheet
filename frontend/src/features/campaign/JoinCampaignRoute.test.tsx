import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import JoinCampaignRoute from "@/features/campaign/JoinCampaignRoute";
import * as client from "@/api/client";
import type { Campaign } from "@/types/character";

vi.mock("@/api/client", () => ({
  joinCampaign: vi.fn(),
}));

const campaign = { id: "camp-1" } as Campaign;

function renderAt(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:code" element={<JoinCampaignRoute />} />
        <Route path="/campaigns" element={<div>Campaigns hub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("JoinCampaignRoute (#246)", () => {
  it("joins with the code from the URL then redirects to the hub", async () => {
    vi.mocked(client.joinCampaign).mockResolvedValue(campaign);

    renderAt("invite-xyz");

    expect(vi.mocked(client.joinCampaign)).toHaveBeenCalledWith("invite-xyz");
    await waitFor(() => expect(screen.getByText("Campaigns hub")).toBeInTheDocument());
  });

  it("shows an error when the code is invalid", async () => {
    vi.mocked(client.joinCampaign).mockRejectedValue(new Error("Campaign not found"));

    renderAt("bogus");

    await waitFor(() => expect(screen.getByText("Campaign not found")).toBeInTheDocument());
  });
});
