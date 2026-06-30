import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import CampaignDetailPage from "@/features/campaign/CampaignDetailPage";
import * as client from "@/api/client";
import type { Campaign, CharacterSummary } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaign: vi.fn(),
  fetchCharacters: vi.fn(),
  addCharacterToCampaign: vi.fn(),
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
    characters: [],
    ...overrides,
  };
}

const CHARACTERS: CharacterSummary[] = [
  { id: "char-1", name: "Thordak", race: "Dwarf", class: "Fighter", level: 3 },
];

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/campaigns/camp-1"]}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CampaignDetailPage (#246)", () => {
  it("add-character dropdown calls addCharacterToCampaign and refreshes", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaign)
      .mockResolvedValueOnce(makeCampaign())
      .mockResolvedValueOnce(
        makeCampaign({ characters: [{ id: "char-1", name: "Thordak", ownerId: "u1" }] }),
      );
    vi.mocked(client.fetchCharacters).mockResolvedValue(CHARACTERS);
    vi.mocked(client.addCharacterToCampaign).mockResolvedValue({} as never);

    renderDetail();

    await screen.findByText("The Sunless Citadel");
    await user.selectOptions(screen.getByLabelText(/your characters/i), "char-1");
    await user.click(screen.getByRole("button", { name: /add character/i }));

    expect(vi.mocked(client.addCharacterToCampaign)).toHaveBeenCalledWith("char-1", "camp-1");
    await waitFor(() => expect(vi.mocked(client.fetchCampaign)).toHaveBeenCalledTimes(2));
  });

  it("shows the invite link and the caller's role", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(makeCampaign());
    vi.mocked(client.fetchCharacters).mockResolvedValue([]);

    renderDetail();

    await screen.findByText("The Sunless Citadel");
    expect(screen.getByDisplayValue(/\/join\/abc123$/)).toBeInTheDocument();
    // "Owner" appears in both the header role badge and the roster.
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
  });
});
