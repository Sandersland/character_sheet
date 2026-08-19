import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignDangerZone from "@/features/campaign/CampaignDangerZone";

vi.mock("@/api/client", () => ({
  deleteCampaign: vi.fn(),
}));

function renderZone() {
  return render(
    <MemoryRouter>
      <CampaignDangerZone campaignId="camp-1" campaignName="The Sunless Citadel" />
    </MemoryRouter>,
  );
}

describe("CampaignDangerZone", () => {
  it("opens the delete confirmation modal from the danger-zone button", async () => {
    renderZone();

    expect(screen.queryByRole("heading", { name: "Delete campaign?" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete campaign" }));

    expect(screen.getByRole("heading", { name: "Delete campaign?" })).toBeInTheDocument();
  });

  it("closes the modal on Cancel without deleting", async () => {
    renderZone();

    await userEvent.click(screen.getByRole("button", { name: "Delete campaign" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: "Delete campaign?" })).not.toBeInTheDocument();
  });
});
