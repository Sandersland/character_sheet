import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import CampaignDetailPage from "@/features/campaign/CampaignDetailPage";
import * as client from "@/api/client";
import { __resetCampaignEntitiesCacheForTests } from "@/hooks/useCampaignEntities";
import type { Campaign, CharacterSummary } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaign: vi.fn(),
  fetchCharacters: vi.fn(),
  addCharacterToCampaign: vi.fn(),
  fetchEntities: vi.fn(),
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

// Surfaces the current pathname so tests can assert tab clicks update the URL.
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderDetail(initialEntry = "/campaigns/camp-1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/campaigns/:id/codex" element={<CampaignDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The entity cache is module-level and leaks across tests without a reset.
  __resetCampaignEntitiesCacheForTests();
  vi.mocked(client.fetchEntities).mockResolvedValue([]);
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
    const select = await screen.findByLabelText(/your characters/i);
    // fetchCharacters resolves independently of fetchCampaign; wait for the
    // option to populate before selecting, else selectOptions races the fetch
    // and intermittently sees the empty "No characters to add" select.
    await screen.findByRole("option", { name: "Thordak" });
    await user.selectOptions(select, "char-1");
    await user.click(screen.getByRole("button", { name: /add character/i }));

    expect(vi.mocked(client.addCharacterToCampaign)).toHaveBeenCalledWith("char-1", "camp-1");
    await waitFor(() => expect(vi.mocked(client.fetchCampaign)).toHaveBeenCalledTimes(2));
  });

  it("shows the invite link and the caller's role", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(makeCampaign());
    vi.mocked(client.fetchCharacters).mockResolvedValue([]);

    renderDetail();

    await screen.findByText("The Sunless Citadel");
    expect(await screen.findByDisplayValue(/\/join\/abc123$/)).toBeInTheDocument();
    // "Owner" appears in both the header role badge and the roster.
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
  });

  it("excludes a character already in a different campaign from the dropdown", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(makeCampaign());
    vi.mocked(client.fetchCharacters).mockResolvedValue([
      { id: "char-1", name: "Thordak", race: "Dwarf", class: "Fighter", level: 3 },
      { id: "char-2", name: "Elsewhere", race: "Elf", class: "Wizard", level: 2, campaignId: "other-camp" },
    ]);

    renderDetail();

    await screen.findByText("The Sunless Citadel");
    const select = await screen.findByLabelText(/your characters/i);
    await waitFor(() => {
      const optionLabels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
      expect(optionLabels).toContain("Thordak");
      expect(optionLabels).not.toContain("Elsewhere");
    });
  });

  it("shows 'No character yet' for a member with no character", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(makeCampaign());
    vi.mocked(client.fetchCharacters).mockResolvedValue([]);

    renderDetail();

    await screen.findByText("The Sunless Citadel");
    expect(screen.getByText(/no character yet/i)).toBeInTheDocument();
  });

  it("shows joined character names and not the empty hint for a member with characters", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(
      makeCampaign({ characters: [{ id: "char-1", name: "Thordak", ownerId: "u1" }] }),
    );
    vi.mocked(client.fetchCharacters).mockResolvedValue([]);

    renderDetail();

    await screen.findByText("The Sunless Citadel");
    expect(screen.getByText("Thordak")).toBeInTheDocument();
    expect(screen.queryByText(/no character yet/i)).not.toBeInTheDocument();
  });
});

describe("CampaignDetailPage tabs (#367)", () => {
  beforeEach(() => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(makeCampaign());
    vi.mocked(client.fetchCharacters).mockResolvedValue([]);
  });

  it("shows the Overview tab active with the invite card by default", async () => {
    renderDetail();

    await screen.findByText("The Sunless Citadel");
    expect(screen.getByRole("tab", { name: /overview/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /codex/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByDisplayValue(/\/join\/abc123$/)).toBeInTheDocument();
  });

  it("hides the Codex tab badge while the entity count is zero", async () => {
    renderDetail();

    await screen.findByText("The Sunless Citadel");
    expect(screen.getByRole("tab", { name: /codex/i })).not.toHaveTextContent("0");
  });

  it("shows the entity count on the Codex tab badge once loaded", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([
      { id: "e1", campaignId: "camp-1", type: "NPC", name: "Klarg", aliases: [], notes: null },
      { id: "e2", campaignId: "camp-1", type: "LOCATION", name: "Cragmaw", aliases: [], notes: null },
    ] as never);

    renderDetail();

    await screen.findByText("The Sunless Citadel");
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /codex/i })).toHaveTextContent("2"),
    );
  });

  it("deep-links to the Codex tab at /campaigns/:id/codex", async () => {
    renderDetail("/campaigns/camp-1/codex");

    await screen.findByText("The Sunless Citadel");
    expect(screen.getByRole("tab", { name: /codex/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText("Roster")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/\/join\/abc123$/)).not.toBeInTheDocument();
  });

  it("clicking the Codex tab updates the URL and swaps panels", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("The Sunless Citadel");
    await user.click(screen.getByRole("tab", { name: /codex/i }));

    expect(screen.getByTestId("location")).toHaveTextContent("/campaigns/camp-1/codex");
    expect(screen.queryByText("Roster")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /overview/i }));
    expect(screen.getByTestId("location")).toHaveTextContent(/\/campaigns\/camp-1$/);
    expect(await screen.findByText("Roster")).toBeInTheDocument();
  });
});
