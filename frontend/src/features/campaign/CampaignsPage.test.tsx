import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignsPage from "@/features/campaign/CampaignsPage";
import * as client from "@/api/client";
import type { Campaign } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  joinCampaign: vi.fn(),
}));

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    name: "The Sunless Citadel",
    ownerId: "u1",
    inviteCode: "abc123",
    createdAt: new Date().toISOString(),
    role: "OWNER",
    members: [
      {
        id: "m1",
        userId: "u1",
        role: "OWNER",
        user: { id: "u1", name: "Ada", email: "ada@x.dev", imageUrl: null },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CampaignsPage (#246)", () => {
  it("loads campaigns from the list endpoint and links each to its detail page", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([makeCampaign()]);

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    expect(vi.mocked(client.fetchCampaigns)).toHaveBeenCalled();
    const link = await screen.findByRole("link", { name: /the sunless citadel/i });
    expect(link).toHaveAttribute("href", "/campaigns/camp-1");
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("create flow calls the client and reloads the list", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaigns)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeCampaign({ name: "New Campaign" })]);
    vi.mocked(client.createCampaign).mockResolvedValue(makeCampaign({ name: "New Campaign" }));

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no campaigns yet/i);
    await user.type(screen.getByLabelText(/campaign name/i), "New Campaign");
    await user.click(screen.getByRole("button", { name: /create campaign/i }));

    expect(vi.mocked(client.createCampaign)).toHaveBeenCalledWith("New Campaign");
    await waitFor(() => expect(vi.mocked(client.fetchCampaigns)).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("link", { name: /new campaign/i })).toBeInTheDocument();
  });
});
