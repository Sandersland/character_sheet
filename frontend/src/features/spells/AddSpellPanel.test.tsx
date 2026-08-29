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

describe("AddSpellPanel tab set (#1817)", () => {
  beforeEach(() => {
    vi.mocked(client.fetchSpells).mockResolvedValue([]);
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
  });

  it("shows only From catalog + Homebrew, with no legacy Custom spell tab", async () => {
    render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
        edition="EDITION_2024"
        characterId="char-1"
      />
    );

    expect(await screen.findByRole("button", { name: "From catalog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Homebrew" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Custom spell" })).not.toBeInTheDocument();
  });
});

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
        characterId="char-1"
      />
    );

    expect(await screen.findByLabelText("Search spells")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by level")).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AddSpellPanel campaign-aware picker (#1811)", () => {
  beforeEach(() => {
    vi.mocked(client.fetchSpells).mockReset();
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
  });

  it("fetches the catalog with the characterId prop so campaign-shared spells resolve", async () => {
    vi.mocked(client.fetchSpells).mockResolvedValue([]);

    render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
        edition="EDITION_2024"
        characterId="char-42"
      />
    );

    await waitFor(() =>
      expect(client.fetchSpells).toHaveBeenCalledWith("EDITION_2024", { characterId: "char-42" })
    );
  });
});

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
        characterId="char-1"
      />
    );

    await user.click(screen.getByRole("button", { name: "Homebrew" }));
    await user.type(screen.getByLabelText(/spell name/i), "Test Bolt");
    await user.type(screen.getByLabelText(/description/i), "A bolt of test energy.");
    await user.click(screen.getByRole("button", { name: /create homebrew spell/i }));

    await waitFor(() => expect(client.createCustomSpell).toHaveBeenCalledWith(expect.anything(), "char-1"));

    expect(await screen.findByText("Test Bolt")).toBeInTheDocument();
    expect(client.fetchSpells).toHaveBeenCalledTimes(2);
  });
});

describe("AddSpellPanel — Homebrew tab gates Edit/Delete on catalog.editable (#1808/#1811)", () => {
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
    catalog: { entryId: "entry-fireball", scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false },
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
    vi.mocked(client.fetchSpells).mockReset();
  });

  it("shows Edit/Delete on the Homebrew tab once the post-fork refetch re-supplies the DM's own CAMPAIGN fork (editable: true)", async () => {
    const forkedRow: CatalogSpell = {
      ...SEEDED_SPELL,
      id: "fork-1",
      catalog: { entryId: "entry-campaign-fork", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-fireball", editable: true },
    };
    vi.mocked(client.fetchSpells).mockResolvedValueOnce([SEEDED_SPELL]).mockResolvedValue([SEEDED_SPELL, forkedRow]);
    vi.mocked(client.fetchCampaigns).mockResolvedValue([DM_CAMPAIGN]);
    vi.mocked(client.forkCatalogEntry).mockResolvedValue({ entryId: "entry-campaign-fork", spell: forkedRow });

    const user = userEvent.setup();
    render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
        edition="EDITION_2014"
        characterId="char-1"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Fork Fireball" }));
    await user.click(await screen.findByRole("button", { name: "Override for The Sunless Citadel" }));
    await waitFor(() => expect(client.forkCatalogEntry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.fetchSpells).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: "Homebrew" }));

    expect(await screen.findByText("Fireball")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Fireball" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Fireball" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share Fireball" })).not.toBeInTheDocument();
  });

  it("excludes a fellow (non-DM) member's non-editable CAMPAIGN row from the Homebrew tab entirely", async () => {
    const notMyFork: CatalogSpell = {
      ...SEEDED_SPELL,
      id: "fork-1",
      catalog: { entryId: "entry-campaign-fork", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-fireball", editable: false },
    };
    vi.mocked(client.fetchSpells).mockResolvedValue([SEEDED_SPELL, notMyFork]);

    const user = userEvent.setup();
    render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
        edition="EDITION_2014"
        characterId="char-2"
      />,
    );

    await waitFor(() => expect(client.fetchSpells).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Homebrew" }));

    expect(screen.getByText(/haven't authored any homebrew spells/i)).toBeInTheDocument();
  });

  it("a caller who DMs no campaign never gets the override option at all", async () => {
    vi.mocked(client.fetchSpells).mockResolvedValue([SEEDED_SPELL]);
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    const user = userEvent.setup();
    render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
        edition="EDITION_2014"
        characterId="char-3"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Fork Fireball" }));

    expect(await screen.findByRole("button", { name: "Make my version" })).toBeInTheDocument();
    expect(screen.queryByText(/override for a campaign you run/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Homebrew" }));
    expect(screen.getByText(/haven't authored any homebrew spells/i)).toBeInTheDocument();
  });
});
