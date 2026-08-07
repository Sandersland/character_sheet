import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellCatalogRow from "@/features/spells/SpellCatalogRow";
import type { CatalogSpell } from "@/types/character";

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
  catalog: { entryId: "entry-fireball", scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false },
};

describe("SpellCatalogRow", () => {
  it("omits the Fork button when no onFork handler is given (other SpellCatalogRow callers)", () => {
    render(<SpellCatalogRow spell={SEEDED_SPELL} alreadyKnown={false} busy={false} onLearn={() => {}} />);
    expect(screen.queryByRole("button", { name: "Fork Fireball" })).not.toBeInTheDocument();
  });

  it("offers Fork for a row the caller doesn't own, and calls onFork with the spell", async () => {
    const onFork = vi.fn();
    const user = userEvent.setup();
    render(<SpellCatalogRow spell={SEEDED_SPELL} alreadyKnown={false} busy={false} onLearn={() => {}} onFork={onFork} />);

    await user.click(screen.getByRole("button", { name: "Fork Fireball" }));
    expect(onFork).toHaveBeenCalledWith(SEEDED_SPELL);
  });

  it("omits Fork for the caller's own row (ownerId set) — Edit/Delete lives in the Homebrew tab instead", () => {
    const own: CatalogSpell = { ...SEEDED_SPELL, ownerId: "u1", catalog: { entryId: "e1", scope: "USER", isFork: false, forkedFromId: null, editable: true } };
    render(<SpellCatalogRow spell={own} alreadyKnown={false} busy={false} onLearn={() => {}} onFork={() => {}} />);
    expect(screen.queryByRole("button", { name: `Fork ${own.name}` })).not.toBeInTheDocument();
  });

  it("badges a granted USER row 'Shared homebrew' and a CAMPAIGN row 'Campaign homebrew'", () => {
    const shared: CatalogSpell = { ...SEEDED_SPELL, catalog: { entryId: "e1", scope: "USER", isFork: false, forkedFromId: null, editable: false } };
    const { rerender } = render(<SpellCatalogRow spell={shared} alreadyKnown={false} busy={false} onLearn={() => {}} />);
    expect(screen.getByText("Shared homebrew")).toBeInTheDocument();

    const campaignSpell: CatalogSpell = { ...SEEDED_SPELL, catalog: { entryId: "e1", scope: "CAMPAIGN", isFork: false, forkedFromId: null, editable: false } };
    rerender(<SpellCatalogRow spell={campaignSpell} alreadyKnown={false} busy={false} onLearn={() => {}} />);
    expect(screen.getByText("Campaign homebrew")).toBeInTheDocument();
  });

  it("badges a fork 'Forked'", () => {
    const forked: CatalogSpell = { ...SEEDED_SPELL, catalog: { entryId: "e1", scope: "USER", isFork: true, forkedFromId: "entry-fireball", editable: false } };
    render(<SpellCatalogRow spell={forked} alreadyKnown={false} busy={false} onLearn={() => {}} />);
    expect(screen.getByText("Forked")).toBeInTheDocument();
  });
});
