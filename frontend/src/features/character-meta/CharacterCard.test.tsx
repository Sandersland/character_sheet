import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CharacterCard from "@/features/character-meta/CharacterCard";
import { axe } from "@/test/axe";
import type { CharacterSummary } from "@/types/character";

const base: CharacterSummary = {
  id: "char-1",
  ownerId: "user-1",
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
    // Query the node directly rather than by role to assert on its src attribute.
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/portrait.jpg");
  });

  // Regression for #180: the card title must be an <h2> so the list page
  // (page <h1> → card titles) has no skipped heading level. A standalone
  // <h3> here used to trip axe's heading-order rule in page context.
  it("renders the card title as an h2", () => {
    renderCard();
    expect(
      screen.getByRole("heading", { level: 2, name: "Gandalf the Grey" })
    ).toBeInTheDocument();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderCard();
    expect(await axe(container)).toHaveNoViolations();
  });
});
