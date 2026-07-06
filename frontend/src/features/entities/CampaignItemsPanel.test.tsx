import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignItemsPanel from "@/features/entities/CampaignItemsPanel";
import type { CampaignItem } from "@/types/character";

let mockEntities: { id: string; name: string; visibility: string }[] = [];
vi.mock("@/hooks/useCampaignEntities", () => ({
  useCampaignEntities: () => ({ entities: mockEntities }),
  primeCampaignEntities: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  fetchCampaignItems: vi.fn(),
  fetchItems: vi.fn(() => Promise.resolve([])),
  awardCampaignItem: vi.fn(),
  revokeCampaignItem: vi.fn(),
  createCampaignItem: vi.fn(),
  updateCampaignItem: vi.fn(),
  deleteCampaignItem: vi.fn(),
  updateEntity: vi.fn(),
}));

import {
  awardCampaignItem,
  fetchCampaignItems,
  revokeCampaignItem,
  updateCampaignItem,
} from "@/api/client";
import { primeCampaignEntities } from "@/hooks/useCampaignEntities";

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

describe("CampaignItemsPanel edit (#505)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntities = [{ id: "ent-1", name: "Flametongue", visibility: "HIDDEN" }];
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, description: "A burning blade", weapon: { damageDiceCount: 2, damageDiceFaces: 6, damageModifier: 0, damageType: "fire", finesse: false, light: false, heavy: false, twoHanded: false, reach: false, thrown: false, ammunition: false } },
    ]);
  });

  it("opens the shared form pre-filled and saves via updateCampaignItem", async () => {
    vi.mocked(updateCampaignItem).mockResolvedValue({
      ...baseItem,
      name: "Flametongue +2",
      description: "A burning blade",
      entity: { id: "ent-1", name: "Flametongue +2", visibility: "HIDDEN" },
      holders: [],
    });
    renderPanel();
    await screen.findByText("Flametongue");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const nameInput = screen.getByLabelText("Name *") as HTMLInputElement;
    expect(nameInput.value).toBe("Flametongue");
    expect((screen.getByLabelText("Damage type") as HTMLInputElement).value).toBe("fire");
    // Edit mode drops the clone-from-catalog control.
    expect(screen.queryByLabelText("Clone from catalog (optional)")).not.toBeInTheDocument();

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Flametongue +2");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateCampaignItem).toHaveBeenCalledWith(
        "camp-1",
        "item-1",
        expect.objectContaining({ name: "Flametongue +2" }),
      ),
    );
    // List reflects the rename; the fronting entity is renamed in the shared cache.
    await screen.findByText("Flametongue +2");
    await waitFor(() =>
      expect(primeCampaignEntities).toHaveBeenCalledWith("camp-1", [
        { id: "ent-1", name: "Flametongue +2", visibility: "HIDDEN" },
      ]),
    );
    // Form closes after a successful save.
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("keeps existing holders after an edit whose response omits them", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }] },
    ]);
    vi.mocked(updateCampaignItem).mockResolvedValue({
      ...baseItem,
      name: "Flametongue +2",
      entity: { id: "ent-1", name: "Flametongue +2", visibility: "HIDDEN" },
      holders: [],
    });
    renderPanel();
    await screen.findByText(/Held by/);

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText("Flametongue +2");
    expect(screen.getByText(/Held by/)).toHaveTextContent("Bruenor");
  });

  it("cancels an edit without calling updateCampaignItem", async () => {
    renderPanel();
    await screen.findByText("Flametongue");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(updateCampaignItem).not.toHaveBeenCalled();
  });
});
