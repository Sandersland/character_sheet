import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HomebrewSpellManageRow from "@/features/spells/HomebrewSpellManageRow";
import * as client from "@/api/client";
import type { CatalogSpell } from "@/types/character";

// ShareSpellSheet talks to the campaign/grant endpoints; stubbed here so this
// suite only exercises HomebrewSpellManageRow's own rendering + wiring.
vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
  shareCatalogEntry: vi.fn(),
  unshareCatalogEntry: vi.fn(),
}));

const OWN_SPELL: CatalogSpell = {
  id: "own-1",
  ownerId: "u1",
  name: "Ember Bolt",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "A homebrew bolt of embers.",
  concentration: false,
  ritual: false,
  classes: ["wizard"],
  cantripScaling: false,
  catalog: { entryId: "entry-1", scope: "USER", isFork: false, forkedFromId: null },
};

const FORKED_SPELL: CatalogSpell = {
  ...OWN_SPELL,
  id: "own-2",
  name: "Ember Bolt (mine)",
  catalog: { entryId: "entry-2", scope: "USER", isFork: true, forkedFromId: "entry-fireball" },
};

describe("HomebrewSpellManageRow", () => {
  beforeEach(() => {
    vi.mocked(client.fetchCampaigns).mockReset().mockResolvedValue([]);
  });

  it("opens ShareSpellSheet on 'Share'", async () => {
    const user = userEvent.setup();
    render(<HomebrewSpellManageRow spell={OWN_SPELL} busy={false} onEdit={() => {}} onDelete={async () => {}} />);

    await user.click(screen.getByRole("button", { name: "Share Ember Bolt" }));

    expect(await screen.findByText('Share "Ember Bolt"')).toBeInTheDocument();
  });

  it("shows a 'Forked' badge only when the row is itself a fork", () => {
    const { rerender } = render(
      <HomebrewSpellManageRow spell={OWN_SPELL} busy={false} onEdit={() => {}} onDelete={async () => {}} />,
    );
    expect(screen.queryByText("Forked")).not.toBeInTheDocument();

    rerender(<HomebrewSpellManageRow spell={FORKED_SPELL} busy={false} onEdit={() => {}} onDelete={async () => {}} />);
    expect(screen.getByText("Forked")).toBeInTheDocument();
  });

  it("omits the Share action when a row has no catalog metadata (older fixture shape)", () => {
    const withoutCatalog: CatalogSpell = { ...OWN_SPELL, catalog: undefined };
    render(<HomebrewSpellManageRow spell={withoutCatalog} busy={false} onEdit={() => {}} onDelete={async () => {}} />);

    expect(screen.queryByRole("button", { name: "Share Ember Bolt" })).not.toBeInTheDocument();
  });
});
