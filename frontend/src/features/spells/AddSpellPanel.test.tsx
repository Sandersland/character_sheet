import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AddSpellPanel from "@/features/spells/AddSpellPanel";
import * as client from "@/api/client";
import { axe } from "@/test/axe";
import type { Campaign, CatalogSpell, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSpells: vi.fn(),
  fetchReference: vi.fn(),
  createCustomSpell: vi.fn(),
  fetchCampaigns: vi.fn(),
  forkCatalogEntry: vi.fn(),
}));

const noop = () => {};

const REFERENCE: ReferenceData = {
  species: [],
  classes: [],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
  conditions: [],
  universalActions: [],
  itemRarities: [],
};

describe("AddSpellPanel accessibility", () => {
  beforeEach(() => {
    vi.mocked(client.fetchSpells).mockResolvedValue([]);
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
  });

  it("labels the catalog search and level filter (no axe violations)", async () => {
    const { container } = render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
        edition="EDITION_2024"
      />
    );

    expect(await screen.findByLabelText("Search spells")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by level")).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});

// #1787, epic #1782 4/5: creating a homebrew spell must land the picker back
// on the catalog tab with GET /api/spells refetched, so the new row shows up
// without the user having to close/reopen the panel.
describe("AddSpellPanel homebrew tab integration", () => {
  const HOMEBREW_CATALOG_SPELL: CatalogSpell = {
    id: "s1",
    name: "Test Bolt",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "A bolt of test energy.",
    concentration: false,
    ritual: false,
    classes: [],
    cantripScaling: false,
  };

  beforeEach(() => {
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
    vi.mocked(client.fetchSpells).mockReset();
    vi.mocked(client.createCustomSpell).mockReset();
  });

  it("switches to the catalog tab and refetches after a homebrew spell is created", async () => {
    vi.mocked(client.fetchSpells).mockResolvedValueOnce([]).mockResolvedValueOnce([HOMEBREW_CATALOG_SPELL]);
    vi.mocked(client.createCustomSpell).mockResolvedValue({
      id: "s1",
      ownerId: "u1",
      edition: "EDITION_2014",
      name: "Test Bolt",
      level: 1,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "A bolt of test energy.",
      concentration: false,
      ritual: false,
      classes: [],
    });

    const user = userEvent.setup();
    render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
        edition="EDITION_2014"
      />
    );

    await user.click(screen.getByRole("button", { name: "Homebrew" }));
    await user.type(screen.getByLabelText(/spell name/i), "Test Bolt");
    await user.type(screen.getByLabelText(/description/i), "A bolt of test energy.");
    await user.click(screen.getByRole("button", { name: /create homebrew spell/i }));

    await waitFor(() => expect(client.createCustomSpell).toHaveBeenCalledTimes(1));

    // Back on the catalog tab, with the second (post-create) fetchSpells page showing the new spell.
    expect(await screen.findByText("Test Bolt")).toBeInTheDocument();
    expect(client.fetchSpells).toHaveBeenCalledTimes(2);
  });
});

// #1808, epic #1795 8/8: GET /api/spells never serves a CAMPAIGN-scope row
// (spellsRouter's own comment — this picker has no campaign context), so a
// DM's freshly-created CAMPAIGN fork would otherwise vanish the instant
// ForkSpellSheet's onForked bumps catalogRefreshKey and fetchSpells refetches
// WITHOUT it. This is the end-to-end proof that AddSpellPanel keeps the fork
// manageable anyway (locally-tracked override, not a server refetch).
describe("AddSpellPanel — DM's CAMPAIGN-scope fork stays manageable (#1808)", () => {
  const SEEDED_SPELL: CatalogSpell = {
    id: "seeded-1",
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

  const DM_CAMPAIGN: Campaign = {
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

  beforeEach(() => {
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
    vi.mocked(client.fetchCampaigns).mockReset();
    vi.mocked(client.forkCatalogEntry).mockReset();
    // Every fetchSpells call (initial + the post-fork refetch alike) omits
    // the CAMPAIGN fork — the real server never serves one through this route.
    vi.mocked(client.fetchSpells).mockReset().mockResolvedValue([SEEDED_SPELL]);
  });

  it("shows Edit/Delete on the Homebrew tab for a DM's CAMPAIGN override, surviving the post-fork refetch", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([DM_CAMPAIGN]);
    vi.mocked(client.forkCatalogEntry).mockResolvedValue({
      entryId: "entry-campaign-fork",
      spell: {
        ...SEEDED_SPELL,
        id: "fork-1",
        catalog: { entryId: "entry-campaign-fork", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-fireball" },
      },
    });

    const user = userEvent.setup();
    render(
      <AddSpellPanel onLearn={noop} onClose={noop} busy={false} learnedSpellIds={new Set()} edition="EDITION_2014" />,
    );

    await user.click(await screen.findByRole("button", { name: "Fork Fireball" }));
    await user.click(await screen.findByRole("button", { name: "Override for The Sunless Citadel" }));
    await waitFor(() => expect(client.forkCatalogEntry).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Homebrew" }));

    expect(await screen.findByText("Fireball")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Fireball" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Fireball" })).toBeInTheDocument();
    // Not shareable — see HomebrewSpellManageRow's own comment.
    expect(screen.queryByRole("button", { name: "Share Fireball" })).not.toBeInTheDocument();
  });

  it("a caller who DMs no campaign never gets the override option at all", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    const user = userEvent.setup();
    render(
      <AddSpellPanel onLearn={noop} onClose={noop} busy={false} learnedSpellIds={new Set()} edition="EDITION_2014" />,
    );

    await user.click(await screen.findByRole("button", { name: "Fork Fireball" }));

    expect(await screen.findByRole("button", { name: "Make my version" })).toBeInTheDocument();
    expect(screen.queryByText(/override for a campaign you run/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Homebrew" }));
    expect(screen.getByText(/haven't authored any homebrew spells/i)).toBeInTheDocument();
  });
});
