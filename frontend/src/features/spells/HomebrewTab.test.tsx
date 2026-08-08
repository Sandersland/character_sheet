import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HomebrewTab from "@/features/spells/HomebrewTab";
import * as client from "@/api/client";
import type { CatalogSpell, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({
  createCustomSpell: vi.fn(),
  updateCustomSpell: vi.fn(),
  deleteCustomSpell: vi.fn(),
  fetchReference: vi.fn(),
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
};

// `catalog.editable: true` (#1815 review findings 2/10): ownedHomebrewSpells
// (lib/homebrewSpell.ts) now gates purely on catalog.editable, never ownerId
// — a fixture standing in for "the caller's own homebrew" must carry it, the
// same shape a real GET /api/spells row does.
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
  catalog: { entryId: "own-entry-1", scope: "USER", isFork: false, forkedFromId: null, editable: true },
};

// #1788, epic #1782 5/5: HomebrewTab is the manage-view — same tab
// AddSpellPanel mounts for the "Homebrew" tab, given the shared GET
// /api/spells result as a `catalog` prop (see AddSpellPanel's own comment
// for why the fetch is lifted there rather than run again here).
describe("HomebrewTab manage list", () => {
  beforeEach(() => {
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
    vi.mocked(client.createCustomSpell).mockReset();
    vi.mocked(client.updateCustomSpell).mockReset();
    vi.mocked(client.deleteCustomSpell).mockReset();
  });

  it("lists the user's own homebrew spells, excluding seeded ones", () => {
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL, OWN_SPELL]}
        onCreated={noop}
        onEdited={noop}
        onDeleted={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByText("Ember Bolt")).toBeInTheDocument();
    expect(screen.queryByText("Fireball")).not.toBeInTheDocument();
  });

  // #1808, epic #1795 8/8 (gate corrected #1808-leak-fix, epic #1795 8/9):
  // a DM's CAMPAIGN-scope fork carries no ownerId (CatalogEntry.ownerUserId
  // is null for that scope) but IS manageable BY ITS DM — gated on the
  // server-computed catalog.editable, ownedHomebrewSpells' own filter
  // (lib/homebrewSpell.ts).
  it("lists a DM's own (editable) CAMPAIGN-scope fork alongside owned USER homebrew, with Edit/Delete", () => {
    const campaignFork: CatalogSpell = {
      ...OWN_SPELL,
      id: "campaign-fork-1",
      ownerId: undefined,
      name: "Campaign Override Bolt",
      catalog: { entryId: "entry-3", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: true },
    };
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL, campaignFork]}
        onCreated={noop}
        onEdited={noop}
        onDeleted={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByText("Campaign Override Bolt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Campaign Override Bolt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Campaign Override Bolt" })).toBeInTheDocument();
  });

  // The leak an Opus review of the combined #1808+#1811 state caught: #1811's
  // campaign-aware picker serves a DM's CAMPAIGN fork to every campaign
  // member, not just its DM. A non-DM member's own catalog carries the SAME
  // row with editable: false — it must never surface in THEIR manage list at
  // all (not just have Edit/Delete hidden on it — the row itself is absent).
  it("excludes a CAMPAIGN-scope row from the manage list entirely when catalog.editable is false (a non-DM member)", () => {
    const notMyFork: CatalogSpell = {
      ...OWN_SPELL,
      id: "campaign-fork-2",
      ownerId: undefined,
      name: "DM's Other Campaign Bolt",
      catalog: { entryId: "entry-4", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: false },
    };
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL, notMyFork]}
        onCreated={noop}
        onEdited={noop}
        onDeleted={noop}
        onClose={noop}
      />,
    );

    expect(screen.queryByText("DM's Other Campaign Bolt")).not.toBeInTheDocument();
    expect(screen.getByText(/haven't authored any homebrew spells/i)).toBeInTheDocument();
  });

  // #1788, epic #1782 5/5: before the first GET /api/spells resolves,
  // catalog is null — the list must show the loading spinner, not flash "you
  // haven't authored any" (owned would be [] either way, since `catalog ??
  // []` can't tell "empty" from "not loaded yet").
  it("shows a spinner instead of the empty state while the catalog is still loading", () => {
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={null}
        showSpinner
        onCreated={noop}
        onEdited={noop}
        onDeleted={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/haven't authored any homebrew spells/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when the caller has no homebrew spells yet", () => {
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL]}
        onCreated={noop}
        onEdited={noop}
        onDeleted={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByText(/haven't authored any homebrew spells/i)).toBeInTheDocument();
  });

  it("clicking Edit opens the form prefilled; submitting calls updateCustomSpell and refreshes the list", async () => {
    vi.mocked(client.updateCustomSpell).mockResolvedValue({
      id: OWN_SPELL.id,
      ownerId: "u1",
      edition: "EDITION_2014",
      name: "Ember Blast",
      level: OWN_SPELL.level,
      school: OWN_SPELL.school,
      castingTime: OWN_SPELL.castingTime,
      range: OWN_SPELL.range,
      duration: OWN_SPELL.duration,
      description: OWN_SPELL.description,
      concentration: OWN_SPELL.concentration,
      ritual: OWN_SPELL.ritual,
      classes: OWN_SPELL.classes,
    });
    const onEdited = vi.fn();
    const user = userEvent.setup();
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL, OWN_SPELL]}
        onCreated={noop}
        onEdited={onEdited}
        onDeleted={noop}
        onClose={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit Ember Bolt" }));

    const nameInput = screen.getByLabelText(/spell name/i);
    expect(nameInput).toHaveValue("Ember Bolt");
    expect(screen.getByLabelText(/description/i)).toHaveValue("A homebrew bolt of embers.");

    await user.clear(nameInput);
    await user.type(nameInput, "Ember Blast");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(client.updateCustomSpell).toHaveBeenCalledTimes(1));
    expect(client.updateCustomSpell).toHaveBeenCalledWith("own-1", expect.objectContaining({ name: "Ember Blast" }));
    await waitFor(() => expect(onEdited).toHaveBeenCalledTimes(1));

    // Edit closes back to the list view, not left showing the form.
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("delete asks for confirmation before calling deleteCustomSpell, then refreshes the list", async () => {
    vi.mocked(client.deleteCustomSpell).mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL, OWN_SPELL]}
        onCreated={noop}
        onEdited={noop}
        onDeleted={onDeleted}
        onClose={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Ember Bolt" }));
    expect(client.deleteCustomSpell).not.toHaveBeenCalled();
    expect(screen.getByText("Delete Ember Bolt?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm deleting Ember Bolt" }));

    await waitFor(() => expect(client.deleteCustomSpell).toHaveBeenCalledWith("own-1"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  // #1788, epic #1782 5/5: a rejected delete must surface the error AND
  // reset the row out of confirm mode — not leave "Delete {name}? / Confirm
  // / Cancel" showing underneath the error banner.
  it("shows an error and resets the row's confirm state when deleteCustomSpell rejects", async () => {
    vi.mocked(client.deleteCustomSpell).mockRejectedValue(new Error("Delete failed."));
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL, OWN_SPELL]}
        onCreated={noop}
        onEdited={noop}
        onDeleted={onDeleted}
        onClose={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Ember Bolt" }));
    await user.click(screen.getByRole("button", { name: "Confirm deleting Ember Bolt" }));

    expect(await screen.findByText("Delete failed.")).toBeInTheDocument();
    expect(screen.queryByText("Delete Ember Bolt?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Ember Bolt" })).toBeInTheDocument();
    expect(screen.getByText("Ember Bolt")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("cancelling the delete confirmation does not call deleteCustomSpell", async () => {
    const user = userEvent.setup();
    render(
      <HomebrewTab
        edition="EDITION_2014"
        characterId="char-1"
        catalog={[SEEDED_SPELL, OWN_SPELL]}
        onCreated={noop}
        onEdited={noop}
        onDeleted={noop}
        onClose={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Ember Bolt" }));
    await user.click(screen.getByRole("button", { name: "Cancel deleting Ember Bolt" }));

    expect(client.deleteCustomSpell).not.toHaveBeenCalled();
    expect(screen.getByText("Ember Bolt")).toBeInTheDocument();
  });
});
