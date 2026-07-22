import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ProficienciesCard from "@/features/abilities/ProficienciesCard";
import type { Character } from "@/types/character";

// Level-7 Battle Master fixture matching the 0719 playtest bug report
// (#1168): long weapon/armor category names + a subclass-granted tool.
function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    proficiencyBonus: 3,
    weaponProficiencies: [
      { name: "Simple Weapons", source: "class" },
      { name: "Martial Weapons", source: "class" },
    ],
    armorProficiencies: [
      { category: "light", source: "class" },
      { category: "medium", source: "class" },
      { category: "heavy", source: "class" },
      { category: "shield", source: "class" },
    ],
    toolProficiencies: [
      { name: "Woodcarver's Tools", category: "artisan", source: "subclass" },
    ],
    resources: {
      features: [],
      pools: [],
      maneuversKnown: [],
      toolProficienciesKnown: [{ id: "tp1", name: "Woodcarver's Tools" }],
      toolProfChoiceCount: 1,
    },
    ...overrides,
  } as Character;
}

function renderCard(character: Character = makeCharacter()) {
  return render(
    <ProficienciesCard character={character} artisanTools={[]} onUpdate={() => {}} />,
  );
}

describe("ProficienciesCard", () => {
  it("renders long weapon/armor labels fully, without a truncate class", () => {
    renderCard();

    for (const label of ["Simple Weapons", "Martial Weapons", "Heavy Armor"]) {
      const el = screen.getByText(label);
      expect(el).toBeInTheDocument();
      expect(el.className).not.toMatch(/\btruncate\b/);
    }
  });

  it("sizes columns off the card's own container, not the viewport", () => {
    renderCard();

    // Every proficiency-row grid must be inside a @container ancestor and use
    // the @sm: container-query variant — never viewport (sm:/xl:) breakpoints,
    // which forced 3-wide density in a narrow Overview sub-column (#1168).
    const grids = document.querySelectorAll(".grid");
    expect(grids.length).toBeGreaterThan(0);
    for (const grid of grids) {
      expect(grid.className).toMatch(/@sm:grid-cols-2/);
      // Viewport breakpoint form (no leading "@") must be gone entirely.
      expect(grid.className.split(/\s+/)).not.toContain("sm:grid-cols-2");
      expect(grid.className.split(/\s+/)).not.toContain("xl:grid-cols-3");
      expect(grid.closest(".\\@container")).not.toBeNull();
    }
  });

  it("weapon/armor rows drop the bonus/forget spacer slots; tool rows keep them", () => {
    renderCard();

    // Tool row: bonus text + a forget affordance (subclass-granted).
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove proficiency: woodcarver's tools/i }),
    ).toBeInTheDocument();

    // Weapon/armor rows render no forget button at all.
    expect(screen.queryAllByRole("button", { name: /remove proficiency/i })).toHaveLength(1);
  });

  it("abbreviates a long source label in the pill but keeps the full name reachable via title", () => {
    renderCard();

    // "subclass" source label is "Battle Master" — too wide for the pill;
    // it should abbreviate (BM) while a tooltip keeps the full name.
    const pill = screen.getByText("BM");
    expect(pill).toBeInTheDocument();
    expect(pill.getAttribute("title")).toBe("Battle Master");

    // Short single-word sources (Class) are unaffected.
    expect(screen.getAllByText("Class").length).toBeGreaterThan(0);
  });
});
