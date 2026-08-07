import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CampaignOverrideRow from "@/features/spells/CampaignOverrideRow";
import * as client from "@/api/client";
import type { Campaign, CatalogSpell } from "@/types/character";

vi.mock("@/api/client", () => ({
  forkCatalogEntry: vi.fn(),
}));

const CAMPAIGN: Campaign = {
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

const FORKED_SPELL: CatalogSpell = {
  id: "s2",
  name: "Acid Splash",
  level: 0,
  school: "conjuration",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "A seeded spell.",
  concentration: false,
  ritual: false,
  classes: [],
  cantripScaling: false,
  catalog: { entryId: "entry-2", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-1", editable: true },
};

describe("CampaignOverrideRow", () => {
  beforeEach(() => {
    vi.mocked(client.forkCatalogEntry).mockReset();
  });

  it("forks into CAMPAIGN scope and disables itself once done", async () => {
    vi.mocked(client.forkCatalogEntry).mockResolvedValue({ entryId: "entry-2", spell: FORKED_SPELL });
    const onForked = vi.fn();
    const user = userEvent.setup();

    render(<CampaignOverrideRow campaign={CAMPAIGN} entryId="entry-1" onForked={onForked} />);

    await user.click(screen.getByRole("button", { name: "Override for The Sunless Citadel" }));

    await waitFor(() =>
      expect(client.forkCatalogEntry).toHaveBeenCalledWith("entry-1", { scope: "CAMPAIGN", campaignId: "camp-a" }),
    );
    expect(onForked).toHaveBeenCalledTimes(1);
    // The button's aria-label is fixed ("Override for …") across every state — its
    // TEXT flips to "Overridden ✓" and it disables, but the accessible name doesn't
    // change, so the done check queries by the stable label and asserts on content.
    const button = await screen.findByRole("button", { name: "Override for The Sunless Citadel" });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Overridden ✓");
  });

  it("shows a row error and stays clickable when the fork call rejects", async () => {
    vi.mocked(client.forkCatalogEntry).mockRejectedValue(new Error("Only that campaign's DM can fork content into it"));
    const user = userEvent.setup();

    render(<CampaignOverrideRow campaign={CAMPAIGN} entryId="entry-1" onForked={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Override for The Sunless Citadel" }));

    expect(await screen.findByText("Only that campaign's DM can fork content into it")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Override for The Sunless Citadel" })).not.toBeDisabled();
  });
});
