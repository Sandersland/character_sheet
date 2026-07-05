import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignItemsPanel from "@/features/entities/CampaignItemsPanel";
import type { CampaignItem } from "@/types/character";

vi.mock("@/hooks/useCampaignEntities", () => ({
  useCampaignEntities: () => ({ entities: [] }),
  primeCampaignEntities: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  fetchCampaignItems: vi.fn(),
  fetchItems: vi.fn(() => Promise.resolve([])),
  awardCampaignItem: vi.fn(),
  revokeCampaignItem: vi.fn(),
  createCampaignItem: vi.fn(),
  deleteCampaignItem: vi.fn(),
  updateEntity: vi.fn(),
}));

import {
  awardCampaignItem,
  fetchCampaignItems,
  revokeCampaignItem,
} from "@/api/client";

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

const characters = [{ id: "c1", name: "Bruenor", ownerId: "u1" }];

function renderPanel() {
  return render(
    <MemoryRouter>
      <CampaignItemsPanel campaignId="camp-1" characters={characters} />
    </MemoryRouter>,
  );
}

describe("CampaignItemsPanel award/revoke (#381)", () => {
  beforeEach(() => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([baseItem]);
  });

  it("awards to a chosen character and shows the returned holder", async () => {
    vi.mocked(awardCampaignItem).mockResolvedValue({
      holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }],
    });
    renderPanel();
    await screen.findByText("Flametongue");

    await userEvent.selectOptions(screen.getByLabelText("Award to"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "Award" }));

    await waitFor(() =>
      expect(awardCampaignItem).toHaveBeenCalledWith("camp-1", "item-1", { characterId: "c1" }),
    );
    const heldBy = await screen.findByText(/Held by/);
    expect(heldBy).toHaveTextContent("Bruenor");
  });

  it("revokes a held item back to no holders", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }] },
    ]);
    vi.mocked(revokeCampaignItem).mockResolvedValue({ holders: [] });
    renderPanel();
    await screen.findByText(/Held by/);

    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(revokeCampaignItem).toHaveBeenCalledWith("camp-1", "item-1", { characterId: "c1" }),
    );
    await waitFor(() => expect(screen.queryByText(/Held by/)).not.toBeInTheDocument());
  });

  it("hides the award control for a held unique item", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, isUnique: true, holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }] },
    ]);
    renderPanel();
    await screen.findByText(/Held by/);
    expect(screen.queryByLabelText("Award to")).not.toBeInTheDocument();
  });
});
