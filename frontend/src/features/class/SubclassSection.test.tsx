import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SubclassSection from "@/features/class/SubclassSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, ClassOption } from "@/types/character";

const classDef = {
  id: "class-warlock",
  name: "Warlock",
  subclassGateLevel: 3,
  subclasses: [
    { id: "sc-fiend", name: "The Fiend" },
    { id: "sc-celestial", name: "The Celestial" },
  ],
} as unknown as ClassOption;

function makeCharacter(overrides: Partial<Character>): Character {
  return {
    id: "char-1",
    class: "Warlock",
    level: 3,
    rulesEdition: "EDITION_2024",
    rulesEditionLabel: "2024 rules",
    ...overrides,
  } as unknown as Character;
}

describe("SubclassSection — never picked (baseline)", () => {
  it("renders only the picker, no explanation, when no subclass is held", () => {
    renderWithCharacter(
      <SubclassSection classDef={classDef} needsSubclass subclassUnavailable={false} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ subclass: undefined }),
    );
    expect(screen.getByText(/You have reached level 3 — choose a subclass/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByText(/isn't part of/)).not.toBeInTheDocument();
  });

  it("renders nothing when neither a subclass is held nor one is needed", () => {
    const { container } = renderWithCharacter(
      <SubclassSection classDef={classDef} needsSubclass={false} subclassUnavailable={false} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ subclass: undefined }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SubclassSection — a healthy held subclass", () => {
  it("renders only the name, no picker and no explanation", () => {
    renderWithCharacter(
      <SubclassSection classDef={classDef} needsSubclass={false} subclassUnavailable={false} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ subclass: "The Fiend" }),
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
  function renderStranded() {
    return renderWithCharacter(
      <SubclassSection classDef={classDef} needsSubclass subclassUnavailable busy={false} onChoose={vi.fn()} />,
      makeCharacter({ subclass: "The Archfey" }),
    );
  }

  it("renders the stranded name AND the picker together, plus a plain-language explanation naming the subclass and the reason", () => {
    renderStranded();
    expect(screen.getByText("The Archfey")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // Names the subclass and the reason (edition), per the issue's requirement —
    // not just a generic "pick again" prompt.
    expect(screen.getByText(/The Archfey isn't part of 2024 rules/)).toBeInTheDocument();
  });

  it("choosing a replacement calls onChoose with the picked subclass id — reuses the existing setSubclass wiring, no new endpoint", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    renderWithCharacter(
      <SubclassSection classDef={classDef} needsSubclass subclassUnavailable busy={false} onChoose={onChoose} />,
      makeCharacter({ subclass: "The Archfey" }),
    );

    await user.selectOptions(screen.getByRole("combobox"), "sc-celestial");
    expect(onChoose).toHaveBeenCalledWith("sc-celestial");
  });

  it("disables the picker while busy, same as the never-picked case", () => {
    renderWithCharacter(
      <SubclassSection classDef={classDef} needsSubclass subclassUnavailable busy onChoose={vi.fn()} />,
      makeCharacter({ subclass: "The Archfey" }),
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
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
    renderWithCharacter(
      <SubclassSection classDef={undefined} needsSubclass subclassUnavailable={false} busy={false} onChoose={vi.fn()} />,
      makeCharacter({ subclass: undefined }),
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("still explains a stranded pick without a classDef, and omits only the picker", () => {
    renderWithCharacter(
      <SubclassSection classDef={undefined} needsSubclass subclassUnavailable busy={false} onChoose={vi.fn()} />,
      makeCharacter({ subclass: "The Archfey" }),
    );
    // The name and the reason need no catalog — only the option list does, so
    // losing the picker must not also silence the explanation.
    expect(screen.getByText("The Archfey")).toBeInTheDocument();
    expect(screen.getByText(/The Archfey isn't part of 2024 rules/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
