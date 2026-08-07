import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ForkSpellSheet from "@/features/spells/ForkSpellSheet";
import * as client from "@/api/client";
import type { Campaign, CatalogSpell } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
  forkCatalogEntry: vi.fn(),
}));

const SEEDED_SPELL: CatalogSpell = {
  id: "s1",
  name: "Fireball",
  level: 3,
  school: "evocation",
  castingTime: "1 action",
  range: "150 feet",
  duration: "Instantaneous",
  description: "A seeded spell.",
  concentration: false,
  ritual: false,
  classes: [],
  cantripScaling: false,
  catalog: { entryId: "entry-fireball", scope: "GLOBAL", isFork: false, forkedFromId: null },
};

const CAMPAIGN_DM: Campaign = {
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

const CAMPAIGN_PLAYER: Campaign = { ...CAMPAIGN_DM, id: "camp-b", name: "Curse of Strahd", role: "PLAYER" };

const FORK_RESULT = {
  entryId: "entry-2",
  spell: { ...SEEDED_SPELL, id: "s2", catalog: { entryId: "entry-2", scope: "USER" as const, isFork: true, forkedFromId: "entry-fireball" } },
};

describe("ForkSpellSheet", () => {
  beforeEach(() => {
    vi.mocked(client.fetchCampaigns).mockReset();
    vi.mocked(client.forkCatalogEntry).mockReset();
  });

  it("creates a USER fork via 'Make my version' and reports it, disabling further clicks", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);
    vi.mocked(client.forkCatalogEntry).mockResolvedValue(FORK_RESULT);
    const onForked = vi.fn();
    const user = userEvent.setup();

    render(<ForkSpellSheet spell={SEEDED_SPELL} onForked={onForked} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Make my version" }));

    await waitFor(() => expect(client.forkCatalogEntry).toHaveBeenCalledWith("entry-fireball", { scope: "USER" }));
    expect(onForked).toHaveBeenCalledWith(FORK_RESULT);
    expect(await screen.findByRole("button", { name: /your version was created/i })).toBeDisabled();
  });

  it("only offers 'Override for campaign' for campaigns the caller DMs", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([CAMPAIGN_DM, CAMPAIGN_PLAYER]);

    render(<ForkSpellSheet spell={SEEDED_SPELL} onForked={() => {}} onClose={() => {}} />);

    expect(await screen.findByText("The Sunless Citadel")).toBeInTheDocument();
    expect(screen.queryByText("Curse of Strahd")).not.toBeInTheDocument();
  });

  it("forks into CAMPAIGN scope for a DM'd campaign", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([CAMPAIGN_DM]);
    vi.mocked(client.forkCatalogEntry).mockResolvedValue({
      entryId: "entry-3",
      spell: { ...SEEDED_SPELL, id: "s3", catalog: { entryId: "entry-3", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-fireball" } },
    });
    const onForked = vi.fn();
    const user = userEvent.setup();

    render(<ForkSpellSheet spell={SEEDED_SPELL} onForked={onForked} onClose={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Override for The Sunless Citadel" }));

    await waitFor(() =>
      expect(client.forkCatalogEntry).toHaveBeenCalledWith("entry-fireball", { scope: "CAMPAIGN", campaignId: "camp-a" }),
    );
    expect(onForked).toHaveBeenCalledTimes(1);
  });

  // claude-review finding: `disabled` only checked `userForkState !== "idle"`,
  // so a spell served with no catalog metadata (`catalog` undefined) showed a
  // fully-enabled "Make my version" button whose click was a silent no-op
  // (handleMakeMyVersion's own `if (!entryId) return;` fires with no spinner,
  // no error, nothing). The button must be disabled up front instead.
  it("disables 'Make my version' when the spell carries no catalog metadata (no entryId to fork)", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);
    const withoutCatalog: CatalogSpell = { ...SEEDED_SPELL, catalog: undefined };

    render(<ForkSpellSheet spell={withoutCatalog} onForked={() => {}} onClose={() => {}} />);

    expect(await screen.findByRole("button", { name: "Make my version" })).toBeDisabled();
    expect(client.forkCatalogEntry).not.toHaveBeenCalled();
  });

  it("shows an error and stays clickable when the fork call rejects", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);
    vi.mocked(client.forkCatalogEntry).mockRejectedValue(new Error("You do not have access to this catalog entry"));
    const user = userEvent.setup();

    render(<ForkSpellSheet spell={SEEDED_SPELL} onForked={() => {}} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Make my version" }));

    expect(await screen.findByText("You do not have access to this catalog entry")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make my version" })).not.toBeDisabled();
  });
});
