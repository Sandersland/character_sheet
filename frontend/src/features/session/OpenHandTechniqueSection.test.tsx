import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OpenHandTechniqueSection from "@/features/session/OpenHandTechniqueSection";
import { imposeOpenHandRiderTransaction } from "@/api/client";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";

vi.mock("@/api/client", () => ({
  imposeOpenHandRiderTransaction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeTurnState(used = false): TurnState & TurnStateActions {
  return {
    openHandRiderUsedThisTurn: used,
    markOpenHandRiderUsed: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    openHandTechnique: { saveDC: 13 },
    ...overrides,
  } as unknown as Character;
}

const hitRow = { id: "row-1" } as unknown as AttackTallyRow;

describe("OpenHandTechniqueSection (#1245)", () => {
  it("renders nothing when the character has no Open Hand Technique (absent, #1316)", () => {
    const character = makeCharacter({ openHandTechnique: undefined });
    const { container } = renderWithCharacter(
      <OpenHandTechniqueSection turnState={makeTurnState()} currentRow={hitRow} />,
      character,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the focus DC and all three rider buttons, disabled before a hit lands", () => {
    const character = makeCharacter();
    renderWithCharacter(
      <OpenHandTechniqueSection turnState={makeTurnState()} currentRow={null} />,
      character,
    );
    expect(screen.getByText(/DC 13/)).toBeInTheDocument();
    for (const label of ["Addle", "Push", "Topple"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  it("imposing a rider calls the transaction, shows the result, and marks used-this-turn", async () => {
    const updated = makeCharacter();
    vi.mocked(imposeOpenHandRiderTransaction).mockResolvedValue({
      character: updated,
      results: [{ rider: "push", dc: 13, roll: 8, outcome: "applied", summary: "Open Hand Technique — Push: failed — pushed 15 ft." }],
    });
    const turnState = makeTurnState();
    const character = makeCharacter();
    renderWithCharacter(
      <OpenHandTechniqueSection turnState={turnState} currentRow={hitRow} />,
      character,
    );

    await userEvent.click(screen.getByRole("button", { name: "Push" }));

    expect(imposeOpenHandRiderTransaction).toHaveBeenCalledWith("char-1", "push", false);
    expect(turnState.markOpenHandRiderUsed).toHaveBeenCalledOnce();
    expect(await screen.findByText(/pushed 15 ft/)).toBeInTheDocument();
    expect(cachedCharacter("char-1")).toEqual(updated);
  });

  it("all rider buttons are disabled once used this turn", () => {
    const character = makeCharacter();
    renderWithCharacter(
      <OpenHandTechniqueSection turnState={makeTurnState(true)} currentRow={hitRow} />,
      character,
    );
    expect(screen.getByText(/Used this turn/)).toBeInTheDocument();
    for (const label of ["Addle", "Push", "Topple"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });
});
