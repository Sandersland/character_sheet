import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import SpeciesTraitsCard from "@/features/species/SpeciesTraitsCard";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

function makeCharacter(partial: Partial<Character>): Character {
  return { id: "char-1", race: "Hill Dwarf", speciesTraits: [], ...partial } as unknown as Character;
}

// SpeciesTraitsCard reads useCurrentCharacter() and renders served data only
// (no rule arithmetic, CLAUDE.md) — every test asserts on TEXT the fixture
// supplies, never a value the component itself computes.
describe("SpeciesTraitsCard (#1682)", () => {
  it("renders nothing for a legacy race-name-only character (speciesTraits: [])", () => {
    const { container } = renderWithCharacter(<SpeciesTraitsCard />, makeCharacter({}));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the species/variant name (character.race) and every trait's name + cited text", () => {
    renderWithCharacter(
      <SpeciesTraitsCard />,
      makeCharacter({
        race: "Hill Dwarf",
        speciesTraits: [
          { name: "Darkvision", description: "60 ft. (SRD 5.1 p. 18)" },
          { name: "Dwarven Resilience", description: "Advantage vs poison. (SRD 5.1 p. 18)" },
          { name: "Dwarven Toughness", description: "+1 HP per level. (SRD 5.1 p. 20)" },
        ],
      }),
    );
    expect(screen.getByText("Species Traits")).toBeInTheDocument();
    expect(screen.getByText("Hill Dwarf")).toBeInTheDocument();
    expect(screen.getByText("60 ft. (SRD 5.1 p. 18)")).toBeInTheDocument();
    expect(screen.getByText("Dwarven Resilience")).toBeInTheDocument();
    expect(screen.getByText("Advantage vs poison. (SRD 5.1 p. 18)")).toBeInTheDocument();
    expect(screen.getByText("Dwarven Toughness")).toBeInTheDocument();
    expect(screen.getByText("+1 HP per level. (SRD 5.1 p. 20)")).toBeInTheDocument();
  });

  it("renders Darkvision once (in its own accented row, not duplicated in the plain list)", () => {
    renderWithCharacter(
      <SpeciesTraitsCard />,
      makeCharacter({
        speciesTraits: [
          { name: "Darkvision", description: "60 ft." },
          { name: "Stonecunning", description: "History checks about stonework." },
        ],
      }),
    );
    expect(screen.getAllByText("Darkvision")).toHaveLength(1);
  });

  it("renders a species with no Darkvision trait (e.g. Human) without crashing or showing an accent row", () => {
    renderWithCharacter(
      <SpeciesTraitsCard />,
      makeCharacter({ race: "Human", speciesTraits: [{ name: "Resourceful", description: "Heroic Inspiration. (SRD 5.2)" }] }),
    );
    expect(screen.getByText("Resourceful")).toBeInTheDocument();
    expect(screen.queryByText("Darkvision")).not.toBeInTheDocument();
  });
});
