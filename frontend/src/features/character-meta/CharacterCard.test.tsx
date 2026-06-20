import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CharacterCard from "@/features/character-meta/CharacterCard";
import type { CharacterSummary } from "@/types/character";

const base: CharacterSummary = {
  id: "char-1",
  name: "Gandalf the Grey",
  race: "Istari",
  class: "Wizard",
  level: 20,
};

function renderCard(character: CharacterSummary = base) {
  return render(
    <MemoryRouter>
      <CharacterCard character={character} />
    </MemoryRouter>
  );
}

describe("CharacterCard", () => {
  it("renders the character name", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Gandalf the Grey" })).toBeInTheDocument();
  });

  it("renders race and class together", () => {
    renderCard();
    expect(screen.getByText("Istari Wizard")).toBeInTheDocument();
  });

  it("renders a Level badge", () => {
    renderCard();
    expect(screen.getByText("Level 20")).toBeInTheDocument();
  });

  it("links to /characters/:id", () => {
    renderCard();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/characters/char-1");
  });

  it("shows initials when no portraitUrl", () => {
    renderCard({ ...base, portraitUrl: undefined });
    // "Gandalf the Grey" → "G" + "t" → but initials() takes first 2 words → "GT"
    // Actually: split by space → ["Gandalf", "the", "Grey"], take first 2 → ["G", "t"] → "GT"
    expect(screen.getByText("GT")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows an img when portraitUrl is set", () => {
    const { container } = renderCard({ ...base, portraitUrl: "https://example.com/portrait.jpg" });
    // alt="" gives the img role=presentation, so query directly.
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/portrait.jpg");
  });
});
