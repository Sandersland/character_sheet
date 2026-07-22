import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OpenHandTechniqueSection from "@/features/session/OpenHandTechniqueSection";
import { imposeOpenHandRiderTransaction } from "@/api/client";
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
    openHandTechnique: { dc: 13 },
    ...overrides,
  } as unknown as Character;
}

const hitRow = { id: "row-1" } as unknown as AttackTallyRow;

describe("OpenHandTechniqueSection (#1245)", () => {
  it("renders nothing when the character has no Open Hand Technique (null)", () => {
    const { container } = render(
      <OpenHandTechniqueSection
        character={makeCharacter({ openHandTechnique: null })}
        turnState={makeTurnState()}
        currentRow={hitRow}
        onUpdate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the focus DC and all three rider buttons, disabled before a hit lands", () => {
    render(
      <OpenHandTechniqueSection
        character={makeCharacter()}
        turnState={makeTurnState()}
        currentRow={null}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText(/DC 13/)).toBeInTheDocument();
    for (const label of ["Addle", "Push", "Topple"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  it("imposing a rider calls the transaction, shows the result, and marks used-this-turn", async () => {
    vi.mocked(imposeOpenHandRiderTransaction).mockResolvedValue({
      character: makeCharacter(),
      results: [{ rider: "push", dc: 13, roll: 8, outcome: "applied", summary: "Open Hand Technique — Push: failed — pushed 15 ft." }],
    });
    const turnState = makeTurnState();
    const onUpdate = vi.fn();
    render(
      <OpenHandTechniqueSection character={makeCharacter()} turnState={turnState} currentRow={hitRow} onUpdate={onUpdate} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Push" }));

    expect(imposeOpenHandRiderTransaction).toHaveBeenCalledWith("char-1", "push", false);
    expect(turnState.markOpenHandRiderUsed).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByText(/pushed 15 ft/)).toBeInTheDocument();
  });

  it("all rider buttons are disabled once used this turn", () => {
    render(
      <OpenHandTechniqueSection character={makeCharacter()} turnState={makeTurnState(true)} currentRow={hitRow} onUpdate={vi.fn()} />,
    );
    expect(screen.getByText(/Used this turn/)).toBeInTheDocument();
    for (const label of ["Addle", "Push", "Topple"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });
});
