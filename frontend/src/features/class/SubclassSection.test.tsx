import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SubclassSection from "@/features/class/SubclassSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, ClassEntry, ClassOption } from "@/types/character";

const classDef = {
  id: "class-warlock",
  name: "Warlock",
  subclassGateLevel: 3,
  subclasses: [
    { id: "sc-fiend", name: "The Fiend" },
    { id: "sc-celestial", name: "The Celestial" },
  ],
} as unknown as ClassOption;

function makeEntry(overrides: Partial<ClassEntry>): ClassEntry {
  return {
    id: "ce-1",
    name: "Warlock",
    level: 3,
    needsSubclass: false,
    subclassUnavailable: false,
    ...overrides,
  } as ClassEntry;
}

function makeCharacter(overrides: Partial<Character>): Character {
  return {
    id: "char-1",
    class: "Warlock",
    classes: [makeEntry({})],
    level: 3,
    rulesEdition: "EDITION_2024",
    rulesEditionLabel: "2024 rules",
    ...overrides,
  } as unknown as Character;
}

describe("SubclassSection — never picked (baseline)", () => {
  it("renders only the picker, no explanation, when no subclass is held", () => {
    const entry = makeEntry({ subclass: undefined, needsSubclass: true });
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(screen.getByText(/You have reached level 3 — choose a subclass/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByText(/isn't part of/)).not.toBeInTheDocument();
  });

  it("renders nothing when neither a subclass is held nor one is needed", () => {
    const entry = makeEntry({ subclass: undefined, needsSubclass: false });
    const { container } = renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SubclassSection — a healthy held subclass", () => {
  it("renders only the name, no picker and no explanation", () => {
    const entry = makeEntry({ subclass: "The Fiend", needsSubclass: false });
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(screen.getByText("The Fiend")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/isn't part of/)).not.toBeInTheDocument();
  });
});

// #1598: the stranded branch — a character whose held subclass row's edition
// no longer matches its own. The bug this closes: the sheet used to show ONLY
// the name (character.subclass truthy short-circuited the old picker logic),
// with zero subclass features and nothing explaining why — a dead end, since
// the player had no path back to a valid pick.
describe("SubclassSection — stranded on a cross-edition subclass (#1598)", () => {
  function strandedEntry(): ClassEntry {
    return makeEntry({ subclass: "The Archfey", needsSubclass: true, subclassUnavailable: true });
  }

  it("renders the stranded name AND the picker together, plus a plain-language explanation naming the subclass and the reason", () => {
    const entry = strandedEntry();
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(screen.getByText("The Archfey")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // Names the subclass and the reason (edition), per the issue's requirement —
    // not just a generic "pick again" prompt.
    expect(screen.getByText(/The Archfey isn't part of 2024 rules/)).toBeInTheDocument();
  });

  it("choosing a replacement calls onChoose with the picked subclass id — reuses the existing setSubclass wiring, no new endpoint", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const entry = strandedEntry();
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy={false} onChoose={onChoose} />,
      makeCharacter({ classes: [entry] }),
    );

    await user.selectOptions(screen.getByRole("combobox"), "sc-celestial");
    expect(onChoose).toHaveBeenCalledWith("sc-celestial");
  });

  it("disables the picker while busy, same as the never-picked case", () => {
    const entry = strandedEntry();
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

// A homebrew subclass is a NAME with no catalog row (characterInclude's
// subclassRef comment, #911): `entry.subclass` set, `entry.subclassId` null.
// buildClassesView reports needsSubclass=true for it (its `!entry.subclassId`
// half), so the picker must NOT key off needsSubclass alone — that would start
// prompting homebrew characters to replace a subclass they deliberately hold.
// This pins the divergence so it stays deliberate rather than looking like the
// oversight it resembles.
describe("SubclassSection — a homebrew subclass (name, no catalog row)", () => {
  it("shows the name with no picker, even though the backend reports needsSubclass", () => {
    const entry = makeEntry({ subclass: "Pact of the Wandering Star", subclassId: undefined, needsSubclass: true });
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(screen.getByText("Pact of the Wandering Star")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/isn't part of/)).not.toBeInTheDocument();
  });
});

// ClassPanel passes `reference?.classes ?? []`, so `classDef` is undefined for
// the whole window before the reference query resolves. That used to be
// unreachable with the picker open: the retired deriveNeedsSubclass began
// `if (!classDef) return false`, so needsSubclass implied classDef. Moving the
// determination onto the wire (#1598) removed that coupling — the backend
// cannot know whether the client's reference catalog has loaded — which makes
// classDef's absence reachable while the picker renders.
describe("SubclassSection — reference catalog not loaded yet", () => {
  it("renders no picker instead of crashing when a needed subclass has no classDef", () => {
    const entry = makeEntry({ subclass: undefined, needsSubclass: true });
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={undefined} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("still explains a stranded pick without a classDef, and omits only the picker", () => {
    const entry = makeEntry({ subclass: "The Archfey", needsSubclass: true, subclassUnavailable: true });
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={undefined} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    // The name and the reason need no catalog — only the option list does, so
    // losing the picker must not also silence the explanation.
    expect(screen.getByText("The Archfey")).toBeInTheDocument();
    expect(screen.getByText(/The Archfey isn't part of 2024 rules/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

// #1602: a multiclass character renders one SubclassSection per roster entry
// that holds or needs a subclass. Each one must name its own class so a
// player can tell them apart.
describe("SubclassSection — multiclass heading (#1602)", () => {
  it("prefixes the heading with the entry's class name when the character has more than one class", () => {
    const fighterEntry = makeEntry({ id: "ce-fighter", name: "Fighter", subclass: "Champion" });
    const warlockEntry = makeEntry({ id: "ce-warlock", name: "Warlock", subclass: "The Fiend" });
    renderWithCharacter(
      <SubclassSection entry={warlockEntry} classDef={classDef} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [fighterEntry, warlockEntry] }),
    );
    expect(screen.getByText("Warlock Subclass")).toBeInTheDocument();
    expect(screen.queryByText("Subclass")).not.toBeInTheDocument();
  });

  it("keeps the plain 'Subclass' heading for a single-class character", () => {
    const entry = makeEntry({ subclass: "The Fiend" });
    renderWithCharacter(
      <SubclassSection entry={entry} classDef={classDef} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ classes: [entry] }),
    );
    expect(screen.getByText("Subclass")).toBeInTheDocument();
  });
});
