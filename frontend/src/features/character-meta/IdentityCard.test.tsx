import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import IdentityCard from "@/features/character-meta/IdentityCard";
import type { Character } from "@/types/character";

function makeCharacter(partial: Partial<Character>): Character {
  return { id: "char-1", background: "", alignment: "", ...partial } as unknown as Character;
}

describe("IdentityCard (#927)", () => {
  it("renders the Identity heading and the background + alignment strings", () => {
    render(
      <IdentityCard character={makeCharacter({ background: "Sage", alignment: "Lawful Good" })} />,
    );
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Sage")).toBeInTheDocument();
    expect(screen.getByText("Lawful Good")).toBeInTheDocument();
  });

  it("falls back to an em-dash for a blank field", () => {
    render(<IdentityCard character={makeCharacter({ background: "Sage", alignment: "" })} />);
    expect(screen.getByText("Sage")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
