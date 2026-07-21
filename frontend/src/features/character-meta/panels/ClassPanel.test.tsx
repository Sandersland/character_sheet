import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ClassPanel from "@/features/character-meta/panels/ClassPanel";
import type { Character } from "@/types/character";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

vi.mock("@/features/class/ClassFeaturesSection", () => ({
  default: () => <div>class-features-section</div>,
}));

function makeCharacter(overrides: Partial<Character>): Character {
  return { id: "c1", class: "Fighter", ...overrides } as unknown as Character;
}

function renderPanel(character: Character) {
  const props: SheetPanelProps = { character, reference: null, onUpdate: vi.fn() };
  return render(<ClassPanel {...props} />);
}

// #1169: the Class tab's panel — the same ClassFeaturesSection orchestrator that
// used to live inside a card on Overview, now full-width on its own tab.
describe("ClassPanel", () => {
  it("renders ClassFeaturesSection for a character with a class", () => {
    renderPanel(makeCharacter({}));
    expect(screen.getByText("class-features-section")).toBeInTheDocument();
  });

  it("renders nothing for a classless character (guards a stray ?tab=class)", () => {
    const { container } = renderPanel(makeCharacter({ class: undefined }));
    expect(container).toBeEmptyDOMElement();
  });

  // #1208: mobile Class tab ran edge-to-edge — CharacterSheetBody has zero
  // horizontal padding on mobile (md:px-6 only), so ClassPanel must supply its
  // own gutter to match sibling tabs' p-4 cards.
  it("wraps ClassFeaturesSection in a mobile gutter that collapses on desktop", () => {
    renderPanel(makeCharacter({}));
    const sentinel = screen.getByText("class-features-section");
    expect(sentinel.parentElement).toHaveClass("px-4", "md:px-0");
  });
});
