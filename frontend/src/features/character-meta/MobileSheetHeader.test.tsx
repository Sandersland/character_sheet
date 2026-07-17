import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import MobileSheetHeader from "@/features/character-meta/MobileSheetHeader";
import { RollProvider } from "@/features/dice/RollContext";
import type { Character } from "@/types/character";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    name: "Aldric",
    race: "Human",
    class: "Fighter",
    subclass: "Champion",
    level: 7,
    campaignId: "camp1",
    armorClass: 18,
    armorClassBreakdown: [
      { label: "Chain Mail", value: 16 },
      { label: "Shield", value: 2 },
    ],
    initiativeBonus: 2,
    speed: 30,
    proficiencyBonus: 3,
    hitPoints: { current: 44, max: 62, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    ...overrides,
  } as Character;
}

function renderHeader(character = makeCharacter()) {
  return render(
    <MemoryRouter>
      <RollProvider>
        <MobileSheetHeader
          character={character}
          onOpenCapture={vi.fn()}
          onOpenSessions={vi.fn()}
          onOpenActivity={vi.fn()}
          onOpenDelete={vi.fn()}
        />
      </RollProvider>
    </MemoryRouter>,
  );
}

describe("MobileSheetHeader", () => {
  it("renders the name and 'Race · Class Level' subtitle", () => {
    renderHeader();
    expect(screen.getByRole("heading", { name: "Aldric" })).toBeInTheDocument();
    expect(screen.getByText("Human · Fighter 7")).toBeInTheDocument();
  });

  it("shows the subclass pill when present, else Lvl N", () => {
    renderHeader();
    expect(screen.getByText("Champion")).toBeInTheDocument();

    renderHeader(makeCharacter({ subclass: undefined, level: 4 }));
    expect(screen.getByText("Lvl 4")).toBeInTheDocument();
  });

  it("for a multiclass character, the pill shows the level (subclass rides in the class line)", () => {
    renderHeader(
      makeCharacter({
        level: 8,
        subclass: "Champion",
        classes: [
          { id: "cls-1", name: "Fighter", level: 5 },
          { id: "cls-2", name: "Rogue", level: 3 },
        ],
      }),
    );
    expect(screen.getByText("Human · Fighter 5 / Rogue 3")).toBeInTheDocument();
    expect(screen.getByText("Lvl 8")).toBeInTheDocument();
    expect(screen.queryByText("Champion")).not.toBeInTheDocument();
  });

  it("renders the four vital tiles (AC, Init, Speed, Prof)", () => {
    renderHeader();
    expect(screen.getByText("AC")).toBeInTheDocument();
    expect(screen.getByText("Init")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Prof")).toBeInTheDocument();
    // Values render alongside their labels.
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("no longer renders a session button in the header (moved to the doorway bar)", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: /session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /join campaign/i })).not.toBeInTheDocument();
  });

  it("offers 'Join campaign' when the character is in no campaign", () => {
    renderHeader(makeCharacter({ campaignId: undefined }));
    expect(screen.getByRole("link", { name: /join campaign/i })).toHaveAttribute("href", "/campaigns");
  });

  // #979: the live-session controls fold into this one menu (no separate strip).
  it("adds Leave / End Session to the menu while joined, and fires their handlers", () => {
    const onLeave = vi.fn();
    const onEnd = vi.fn();
    render(
      <MemoryRouter>
        <RollProvider>
          <MobileSheetHeader
            character={makeCharacter()}
            sessionActions={{ busy: false, onLeave, onEnd }}
            onOpenCapture={vi.fn()}
            onOpenSessions={vi.fn()}
            onOpenActivity={vi.fn()}
            onOpenDelete={vi.fn()}
          />
        </RollProvider>
      </MemoryRouter>,
    );

    // Selecting an item closes the menu, so re-open it between the two clicks.
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "End Session" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Leave Session" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("disables Leave / End Session while a session action is in flight", () => {
    const onEnd = vi.fn();
    render(
      <MemoryRouter>
        <RollProvider>
          <MobileSheetHeader
            character={makeCharacter()}
            sessionActions={{ busy: true, onLeave: vi.fn(), onEnd }}
            onOpenCapture={vi.fn()}
            onOpenSessions={vi.fn()}
            onOpenActivity={vi.fn()}
            onOpenDelete={vi.fn()}
          />
        </RollProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    const end = screen.getByRole("menuitem", { name: "End Session" });
    expect(end).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(end);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("shows no Leave / End Session items when not in a live session", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    expect(screen.queryByRole("menuitem", { name: "Leave Session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "End Session" })).not.toBeInTheDocument();
  });

  it("exposes Note / Sessions / Activity / Delete in the overflow menu", () => {
    const onOpenCapture = vi.fn();
    const onOpenDelete = vi.fn();
    render(
      <MemoryRouter>
        <RollProvider>
          <MobileSheetHeader
            character={makeCharacter()}
            onOpenCapture={onOpenCapture}
            onOpenSessions={vi.fn()}
            onOpenActivity={vi.fn()}
            onOpenDelete={onOpenDelete}
          />
        </RollProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    expect(screen.getByRole("menuitem", { name: /note/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sessions/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /activity/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /note/i }));
    expect(onOpenCapture).toHaveBeenCalledTimes(1);
  });
});
