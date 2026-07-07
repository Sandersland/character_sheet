import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ItemGrantsCard from "@/features/character-meta/ItemGrantsCard";
import type { Character } from "@/types/character";

function makeCharacter(partial: Partial<Character>): Character {
  return { id: "char-1", ...partial } as unknown as Character;
}

describe("ItemGrantsCard (#529)", () => {
  it("renders nothing when there are no item grants", () => {
    const { container } = render(
      <ItemGrantsCard character={makeCharacter({ resistances: [], grantedAdvantages: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the grant fields are undefined", () => {
    const { container } = render(<ItemGrantsCard character={makeCharacter({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a resistance with its item source, using the label helper (not a raw key)", () => {
    render(
      <ItemGrantsCard
        character={makeCharacter({ resistances: [{ damageType: "fire", source: "Ring of Fire Resistance" }] })}
      />,
    );
    expect(screen.getByText("Fire")).toBeInTheDocument();
    expect(screen.getByText("Ring of Fire Resistance")).toBeInTheDocument();
  });

  it("renders condition immunity and advantage reminders via label helpers", () => {
    render(
      <ItemGrantsCard
        character={makeCharacter({
          conditionImmunities: [{ condition: "poisoned", source: "Periapt" }],
          grantedAdvantages: [
            { on: "check", valueKind: "skill", value: "perception", cantBeSurprised: false, source: "Eyes of the Eagle" },
            { on: "initiative", cantBeSurprised: true, source: "Weapon of Warning" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.getByText(/Advantage on Ability check \(Perception\)/)).toBeInTheDocument();
    expect(screen.getByText(/Advantage on Initiative; can't be surprised/)).toBeInTheDocument();
  });
});
