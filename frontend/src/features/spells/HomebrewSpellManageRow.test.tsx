import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HomebrewSpellManageRow from "@/features/spells/HomebrewSpellManageRow";
import * as client from "@/api/client";
import type { CatalogSpell } from "@/types/character";

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
  catalog: { entryId: "entry-1", scope: "USER", isFork: false, forkedFromId: null, editable: true },
};

const FORKED_SPELL: CatalogSpell = {
  ...OWN_SPELL,
  id: "own-2",
  name: "Ember Bolt (mine)",
  catalog: { entryId: "entry-2", scope: "USER", isFork: true, forkedFromId: "entry-fireball", editable: true },
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

  it("offers Edit/Delete but omits Share for a DM's editable CAMPAIGN-scope fork", () => {
    const campaignFork: CatalogSpell = {
      ...OWN_SPELL,
      ownerId: undefined,
      catalog: { entryId: "entry-3", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: true },
    };
    render(<HomebrewSpellManageRow spell={campaignFork} busy={false} onEdit={() => {}} onDelete={async () => {}} />);

    expect(screen.getByRole("button", { name: "Edit Ember Bolt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Ember Bolt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share Ember Bolt" })).not.toBeInTheDocument();
  });

  it("hides Edit/Delete for a non-DM member's non-editable CAMPAIGN-scope row", () => {
    const notMyFork: CatalogSpell = {
      ...OWN_SPELL,
      ownerId: undefined,
      catalog: { entryId: "entry-4", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: false },
    };
    render(<HomebrewSpellManageRow spell={notMyFork} busy={false} onEdit={() => {}} onDelete={async () => {}} />);

    expect(screen.queryByRole("button", { name: "Edit Ember Bolt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Ember Bolt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share Ember Bolt" })).not.toBeInTheDocument();
  });
});
