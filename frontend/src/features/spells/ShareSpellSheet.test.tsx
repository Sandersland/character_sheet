import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ShareSpellSheet from "@/features/spells/ShareSpellSheet";
import * as client from "@/api/client";
import type { Campaign, CatalogSpell } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
  shareCatalogEntry: vi.fn(),
  unshareCatalogEntry: vi.fn(),
}));

const SPELL: CatalogSpell = {
  id: "s1",
  ownerId: "u1",
  name: "Ember Bolt",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "A homebrew bolt.",
  concentration: false,
  ritual: false,
  classes: [],
  cantripScaling: false,
  catalog: { entryId: "entry-1", scope: "USER", isFork: false, forkedFromId: null },
};

const CAMPAIGN_A: Campaign = {
  id: "camp-a",
  name: "The Sunless Citadel",
  ownerId: "u1",
  rulesEdition: "EDITION_2014",
  rulesEditionLabel: "2014",
  inviteCode: "ABC123",
  createdAt: "2024-01-01T00:00:00.000Z",
  members: [],
  role: "OWNER",
};

const CAMPAIGN_B: Campaign = { ...CAMPAIGN_A, id: "camp-b", name: "Curse of Strahd", role: "PLAYER" };

describe("ShareSpellSheet", () => {
  beforeEach(() => {
    vi.mocked(client.fetchCampaigns).mockReset();
    vi.mocked(client.shareCatalogEntry).mockReset();
    vi.mocked(client.unshareCatalogEntry).mockReset();
  });

  it("lists the caller's campaigns and shares into one on click", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([CAMPAIGN_A, CAMPAIGN_B]);
    vi.mocked(client.shareCatalogEntry).mockResolvedValue({ id: "g1", catalogEntryId: "entry-1", campaignId: "camp-a" });
    const user = userEvent.setup();

    render(<ShareSpellSheet spell={SPELL} onClose={() => {}} />);

    expect(await screen.findByText("The Sunless Citadel")).toBeInTheDocument();
    expect(screen.getByText("Curse of Strahd")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Share into The Sunless Citadel" }));

    await waitFor(() => expect(client.shareCatalogEntry).toHaveBeenCalledWith("entry-1", "camp-a"));
    expect(await screen.findByRole("button", { name: "Unshare from The Sunless Citadel" })).toBeInTheDocument();
  });

  it("unshares a campaign the sheet already shared into this session", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([CAMPAIGN_A]);
    vi.mocked(client.shareCatalogEntry).mockResolvedValue({ id: "g1", catalogEntryId: "entry-1", campaignId: "camp-a" });
    vi.mocked(client.unshareCatalogEntry).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ShareSpellSheet spell={SPELL} onClose={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Share into The Sunless Citadel" }));
    await screen.findByRole("button", { name: "Unshare from The Sunless Citadel" });

    await user.click(screen.getByRole("button", { name: "Unshare from The Sunless Citadel" }));

    await waitFor(() => expect(client.unshareCatalogEntry).toHaveBeenCalledWith("entry-1", "camp-a"));
    expect(await screen.findByRole("button", { name: "Share into The Sunless Citadel" })).toBeInTheDocument();
  });

  // Deliberately the OPPOSITE revert direction from the grant-rejection case
  // below: handleShare's catch reverts to "idle" (the server never got a
  // grant), but handleUnshare's catch reverts to "shared" (the server still
  // holds the grant the DELETE failed to clear) — ShareSpellSheet.tsx's own
  // handleUnshare comment. A revert to "idle" here would tell the player the
  // spell is no longer shared when the campaign can still see it.
  it("reverts to 'Shared ✓ — Unshare' (not 'Share') when the revoke call rejects", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([CAMPAIGN_A]);
    vi.mocked(client.shareCatalogEntry).mockResolvedValue({ id: "g1", catalogEntryId: "entry-1", campaignId: "camp-a" });
    vi.mocked(client.unshareCatalogEntry).mockRejectedValue(new Error("You do not have access to this catalog entry"));
    const user = userEvent.setup();

    render(<ShareSpellSheet spell={SPELL} onClose={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Share into The Sunless Citadel" }));
    await user.click(await screen.findByRole("button", { name: "Unshare from The Sunless Citadel" }));

    expect(await screen.findByText("You do not have access to this catalog entry")).toBeInTheDocument();
    // Still shared, not reset to shareable: the button is the "Unshare" one, not "Share".
    expect(screen.getByRole("button", { name: "Unshare from The Sunless Citadel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share into The Sunless Citadel" })).not.toBeInTheDocument();
  });

  it("shows a row error and stays shareable when the grant call rejects", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([CAMPAIGN_A]);
    vi.mocked(client.shareCatalogEntry).mockRejectedValue(new Error("You do not have access to this campaign"));
    const user = userEvent.setup();

    render(<ShareSpellSheet spell={SPELL} onClose={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Share into The Sunless Citadel" }));

    expect(await screen.findByText("You do not have access to this campaign")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share into The Sunless Citadel" })).toBeInTheDocument();
  });

  it("shows an empty state when the caller has no campaigns", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    render(<ShareSpellSheet spell={SPELL} onClose={() => {}} />);

    expect(await screen.findByText(/a member of any campaigns/i)).toBeInTheDocument();
  });
});
