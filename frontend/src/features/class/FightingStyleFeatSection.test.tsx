import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as client from "@/api/client";
import FightingStyleFeatSection from "@/features/class/FightingStyleFeatSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchFeats: vi.fn().mockResolvedValue([]),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    rulesEdition: "EDITION_2014",
    classes: [
      { id: "ce-1", name: "Ranger", level: 2, needsSubclass: false, subclassMismatch: false },
    ],
    fightingStyleSlots: { total: 1, used: 0 },
    fightingStyleGrantingClasses: ["Ranger"],
    ...overrides,
  } as unknown as Character;
}

function render(character: Character) {
  return renderWithCharacter(
    <FightingStyleFeatSection takenFeats={[]} busy={false} onTake={() => {}} />,
    character,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchFeats).mockResolvedValue([]);
});

// The picker never re-derives the per-class subset or level-threshold check
// itself — it forwards the server-computed fightingStyleGrantingClasses
// straight through to the class-scoped catalog fetch (#1495).
describe("FightingStyleFeatSection — server-gated class scope (#1495)", () => {
  it("forwards fightingStyleGrantingClasses as fetchFeats' classNames argument", async () => {
    const user = userEvent.setup();
    render(makeCharacter());

    await user.click(screen.getByRole("button", { name: "+ Choose a fighting style" }));

    expect(client.fetchFeats).toHaveBeenCalledWith("EDITION_2014", undefined, ["Ranger"]);
  });

  it("forwards every EARNED class name for a multiclass character", async () => {
    const user = userEvent.setup();
    render(
      makeCharacter({
        classes: [
          { id: "ce-1", name: "Fighter", level: 1, needsSubclass: false, subclassMismatch: false },
          { id: "ce-2", name: "Paladin", level: 2, needsSubclass: false, subclassMismatch: false },
        ],
        fightingStyleGrantingClasses: ["Fighter", "Paladin"],
      } as unknown as Partial<Character>),
    );

    await user.click(screen.getByRole("button", { name: "+ Choose a fighting style" }));

    expect(client.fetchFeats).toHaveBeenCalledWith("EDITION_2014", undefined, ["Fighter", "Paladin"]);
  });

  // A Fighter1/Ranger1 multiclass has both classes in `classes`, but Ranger
  // hasn't reached its L2 Fighting Style grant — using `classes` here instead
  // of fightingStyleGrantingClasses would forward Ranger too and the write
  // path would 400 a style the picker just offered.
  it("uses fightingStyleGrantingClasses, NOT the full class roster, when they diverge", async () => {
    const user = userEvent.setup();
    render(
      makeCharacter({
        classes: [
          { id: "ce-1", name: "Fighter", level: 1, needsSubclass: false, subclassMismatch: false },
          { id: "ce-2", name: "Ranger", level: 1, needsSubclass: false, subclassMismatch: false },
        ],
        fightingStyleGrantingClasses: ["Fighter"],
      } as unknown as Partial<Character>),
    );

    await user.click(screen.getByRole("button", { name: "+ Choose a fighting style" }));

    expect(client.fetchFeats).toHaveBeenCalledWith("EDITION_2014", undefined, ["Fighter"]);
  });
});
