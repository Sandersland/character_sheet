import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AddSpellPanel from "@/features/spells/AddSpellPanel";
import * as client from "@/api/client";
import { axe } from "@/test/axe";
import type { CatalogSpell, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSpells: vi.fn(),
  fetchReference: vi.fn(),
  createCustomSpell: vi.fn(),
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
