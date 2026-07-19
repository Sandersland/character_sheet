import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import LevelUpBanner from "@/features/level-up/LevelUpBanner";
import type { Character } from "@/types/character";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    level: 4,
    pendingLevelUps: 1,
    ...overrides,
  } as unknown as Character;
}

function renderBanner(character: Character) {
  return render(
    <MemoryRouter>
      <LevelUpBanner character={character} />
    </MemoryRouter>,
  );
}

describe("LevelUpBanner (issue #892)", () => {
  it("renders nothing when no level-up is pending", () => {
    const { container } = renderBanner(makeCharacter({ pendingLevelUps: 0 }));
    expect(container).toBeEmptyDOMElement();
  });

  it("announces the reached level and links to the ceremony", () => {
    renderBanner(makeCharacter({ level: 4, pendingLevelUps: 1 }));

    expect(screen.getByText(/reached level 4/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /level up/i });
    expect(link).toHaveAttribute("href", "/characters/char-1/level-up");
  });

  it("uses plural advancement wording when more than one is pending", () => {
    renderBanner(makeCharacter({ level: 5, pendingLevelUps: 2 }));

    expect(screen.getByText(/2 advancements/i)).toBeInTheDocument();
  });
});
