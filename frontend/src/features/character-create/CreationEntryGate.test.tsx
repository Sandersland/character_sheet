import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CreationEntryGate from "@/features/character-create/CreationEntryGate";
import { fetchCampaigns } from "@/api/client";
import type { Campaign } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
}));

const mockFetchCampaigns = vi.mocked(fetchCampaigns);

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    name: "The Sunless Citadel",
    ownerId: "u1",
    rulesEdition: "EDITION_2024",
    inviteCode: "abc123",
    createdAt: new Date().toISOString(),
    role: "PLAYER",
    members: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreationEntryGate (#1286)", () => {
  it("with no campaigns, skips straight to the edition picker defaulting to 2024", async () => {
    mockFetchCampaigns.mockResolvedValue([]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    await waitFor(() => expect(mockFetchCampaigns).toHaveBeenCalled());
    expect(await screen.findByRole("radio", { name: "2024 rules" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radiogroup", { name: /campaign/i })).not.toBeInTheDocument();

    // Irreversibility stated at the moment of choosing.
    expect(screen.getByText(/can't be changed later/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({ campaignId: null, rulesEdition: "EDITION_2024" });
  });

  it("lets a solo player switch to 2014 before continuing", async () => {
    mockFetchCampaigns.mockResolvedValue([]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    await userEvent.click(await screen.findByRole("radio", { name: "2014 rules" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({ campaignId: null, rulesEdition: "EDITION_2014" });
  });

  it("with campaigns, asks which campaign first and defaults to Solo", async () => {
    mockFetchCampaigns.mockResolvedValue([makeCampaign()]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    expect(await screen.findByRole("radio", { name: /solo/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /the sunless citadel/i })).toBeInTheDocument();
    // Solo is selected by default, so the edition picker (not an inherited display) shows.
    expect(screen.getByRole("radio", { name: "2024 rules" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({ campaignId: null, rulesEdition: "EDITION_2024" });
  });

  it("picking a campaign displays its inherited edition instead of asking", async () => {
    mockFetchCampaigns.mockResolvedValue([makeCampaign({ rulesEdition: "EDITION_2014" })]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    await userEvent.click(await screen.findByRole("radio", { name: /the sunless citadel/i }));

    // No edition picker once a campaign is chosen — it's inherited, not asked.
    expect(screen.queryByRole("radio", { name: "2024 rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "2014 rules" })).not.toBeInTheDocument();
    expect(screen.getByText(/2014 rules/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({ campaignId: "camp-1", rulesEdition: "EDITION_2014" });
  });

  it("switching back to Solo after picking a campaign re-reveals the edition picker", async () => {
    mockFetchCampaigns.mockResolvedValue([makeCampaign({ rulesEdition: "EDITION_2014" })]);
    render(<CreationEntryGate onResolved={vi.fn()} />);

    await userEvent.click(await screen.findByRole("radio", { name: /the sunless citadel/i }));
    expect(screen.queryByRole("radio", { name: "2024 rules" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /solo/i }));
    expect(screen.getByRole("radio", { name: "2024 rules" })).toBeInTheDocument();
  });

  it("keyboard: arrow keys move focus and selection together across campaign/solo cards (#1111)", async () => {
    mockFetchCampaigns.mockResolvedValue([makeCampaign()]);
    render(<CreationEntryGate onResolved={vi.fn()} />);

    const solo = await screen.findByRole("radio", { name: /solo/i });
    const campaign = screen.getByRole("radio", { name: /the sunless citadel/i });
    expect(solo).toHaveAttribute("tabindex", "0");
    expect(campaign).toHaveAttribute("tabindex", "-1");

    solo.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(campaign).toHaveFocus();
    expect(campaign).toHaveAttribute("aria-checked", "true");
  });
});
