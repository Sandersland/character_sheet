import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CompactTurnHeader from "@/features/session/CompactTurnHeader";
import type { Character } from "@/types/character";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Kael Ironhythe",
    race: "Human",
    class: "Fighter",
    subclass: "Battle Master",
    level: 5,
    ...overrides,
  } as unknown as Character;
}

function renderHeader(props: Partial<React.ComponentProps<typeof CompactTurnHeader>> = {}) {
  const handlers = {
    onCapture: vi.fn(),
    onLeave: vi.fn(),
    onEndClick: vi.fn(),
  };
  render(
    <MemoryRouter>
      <CompactTurnHeader
        character={makeCharacter()}
        round={2}
        leaveError={null}
        {...handlers}
        {...props}
      />
    </MemoryRouter>
  );
  return handlers;
}

describe("CompactTurnHeader", () => {
  it("renders the character name and identity line", () => {
    renderHeader();
    expect(screen.getByRole("heading", { name: "Kael Ironhythe" })).toBeInTheDocument();
    expect(screen.getByText("Human Fighter (Battle Master) · Level 5")).toBeInTheDocument();
  });

  it("omits the subclass parenthetical when absent", () => {
    renderHeader({ character: makeCharacter({ subclass: undefined }) });
    expect(screen.getByText("Human Fighter · Level 5")).toBeInTheDocument();
  });

  it("renders a Round chip", () => {
    renderHeader({ round: 3 });
    expect(screen.getByText("Round 3")).toBeInTheDocument();
  });

  it("links back to the character sheet", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "Back to character sheet" })).toHaveAttribute(
      "href",
      "/characters/char-1"
    );
  });

  it("collapses Note / Leave / End into the overflow menu and fires their handlers", async () => {
    const user = userEvent.setup();
    const handlers = renderHeader();
    await user.click(screen.getByRole("button", { name: "Session actions" }));

    const items = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(items).toEqual(["＋ Note", "Leave Session", "End Session"]);

    await user.click(screen.getByRole("menuitem", { name: "End Session" }));
    expect(handlers.onEndClick).toHaveBeenCalledOnce();
  });

  it("surfaces a leave error when present", () => {
    renderHeader({ leaveError: "Could not leave" });
    expect(screen.getByText("Could not leave")).toBeInTheDocument();
  });
});
