import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SessionLootPanel from "@/features/session/SessionLootPanel";
import { awardCampaignItem, fetchCampaignItems } from "@/api/client";
import type { CampaignItem } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaignItems: vi.fn(),
  awardCampaignItem: vi.fn(),
}));

const mockFetchItems = vi.mocked(fetchCampaignItems);
const mockAward = vi.mocked(awardCampaignItem);

beforeEach(() => {
  vi.clearAllMocks();
});

function item(overrides: Partial<CampaignItem>): CampaignItem {
  return {
    id: "item-1",
    campaignId: "camp-1",
    name: "Flametongue",
    category: "weapon",
    requiresAttunement: false,
    isUnique: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const recipients = [
  { id: "char-1", name: "Bruenor" },
  { id: "char-2", name: "Cattie" },
];

describe("SessionLootPanel (#382)", () => {
  it("awards the chosen item to the selected participant, threading the sessionId", async () => {
    const user = userEvent.setup();
    mockFetchItems.mockResolvedValue([item({ id: "item-1", name: "Flametongue" })]);
    mockAward.mockResolvedValue({ holders: [] });
    const onAwarded = vi.fn();

    render(
      <SessionLootPanel
        campaignId="camp-1"
        sessionId="sess-1"
        recipients={recipients}
        onAwarded={onAwarded}
      />,
    );

    expect(await screen.findByText("Flametongue")).toBeInTheDocument();

    // Retarget to the second participant, then one-click award.
    await user.selectOptions(screen.getByLabelText(/award to/i), "char-2");
    await user.click(screen.getByRole("button", { name: /^award$/i }));

    await waitFor(() =>
      expect(mockAward).toHaveBeenCalledWith("camp-1", "item-1", {
        characterId: "char-2",
        sessionId: "sess-1",
      }),
    );
    expect(onAwarded).toHaveBeenCalled();
    expect(await screen.findByText(/Awarded Flametongue to Cattie/)).toBeInTheDocument();
  });

  it("surfaces an award error without calling onAwarded", async () => {
    const user = userEvent.setup();
    mockFetchItems.mockResolvedValue([item({})]);
    mockAward.mockRejectedValue(new Error("Flametongue is unique and already held by Bruenor"));
    const onAwarded = vi.fn();

    render(
      <SessionLootPanel
        campaignId="camp-1"
        sessionId="sess-1"
        recipients={recipients}
        onAwarded={onAwarded}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /^award$/i }));

    expect(await screen.findByText(/already held by Bruenor/)).toBeInTheDocument();
    expect(onAwarded).not.toHaveBeenCalled();
  });

  it("renders the rarity label, not the raw enum key", async () => {
    mockFetchItems.mockResolvedValue([item({ name: "Flametongue", rarity: "VERY_RARE" })]);
    render(
      <SessionLootPanel
        campaignId="camp-1"
        sessionId="sess-1"
        recipients={recipients}
        onAwarded={() => {}}
      />,
    );
    expect(await screen.findByText("Very Rare")).toBeInTheDocument();
    expect(screen.queryByText("VERY_RARE")).not.toBeInTheDocument();
  });

  it("shows an empty-state when the campaign has no items", async () => {
    mockFetchItems.mockResolvedValue([]);
    render(
      <SessionLootPanel
        campaignId="camp-1"
        sessionId="sess-1"
        recipients={recipients}
        onAwarded={() => {}}
      />,
    );
    expect(await screen.findByText(/No campaign items yet/)).toBeInTheDocument();
  });
});
