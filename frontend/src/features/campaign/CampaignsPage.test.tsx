import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignsPage from "@/features/campaign/CampaignsPage";
import * as client from "@/api/client";
import type { Campaign } from "@/types/character";

vi.mock("@/api/client", () => ({
  createCampaign: vi.fn(),
  joinCampaign: vi.fn(),
}));

function makeCampaign(): Campaign {
  return {
    id: "camp-1",
    name: "The Sunless Citadel",
    ownerId: "u1",
    inviteCode: "abc123",
    createdAt: new Date().toISOString(),
    members: [
      {
        id: "m1",
        userId: "u1",
        role: "OWNER",
        user: { id: "u1", name: "Ada", email: "ada@x.dev", imageUrl: null },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CampaignsPage (#246)", () => {
  it("create flow calls the client and shows the new campaign with its invite link", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createCampaign).mockResolvedValue(makeCampaign());

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/campaign name/i), "The Sunless Citadel");
    await user.click(screen.getByRole("button", { name: /create campaign/i }));

    expect(vi.mocked(client.createCampaign)).toHaveBeenCalledWith("The Sunless Citadel");

    await waitFor(() =>
      expect(screen.getByDisplayValue(/\/join\/abc123$/)).toBeInTheDocument(),
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });
});
