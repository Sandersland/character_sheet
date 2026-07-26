import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuiveringPalmSection from "@/features/session/QuiveringPalmSection";
import { setQuiveringPalmTransaction, triggerQuiveringPalmTransaction } from "@/api/client";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";

vi.mock("@/api/client", () => ({
  setQuiveringPalmTransaction: vi.fn(),
  triggerQuiveringPalmTransaction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeTurnState(): TurnState & TurnStateActions {
  return {
    consumeAction: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    quiveringPalm: { saveDC: 17, active: false },
    ...overrides,
  } as unknown as Character;
}

const hitRow = { id: "row-1" } as unknown as AttackTallyRow;

describe("QuiveringPalmSection (#1245)", () => {
  it("renders nothing when the character has no Quivering Palm (absent, #1316)", () => {
    const character = makeCharacter({ quiveringPalm: undefined });
    const { container } = renderWithCharacter(
      <QuiveringPalmSection turnState={makeTurnState()} currentRow={hitRow} />,
      character,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("Set is disabled without a hit; Trigger is disabled while inactive", () => {
    const character = makeCharacter();
    renderWithCharacter(
      <QuiveringPalmSection turnState={makeTurnState()} currentRow={null} />,
      character,
    );
    expect(screen.getByText(/DC 17/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Set/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Trigger/ })).toBeDisabled();
  });

  it("Set is enabled once a hit lands and not yet active", () => {
    const character = makeCharacter();
    renderWithCharacter(
      <QuiveringPalmSection turnState={makeTurnState()} currentRow={hitRow} />,
      character,
    );
    expect(screen.getByRole("button", { name: /Set/ })).toBeEnabled();
  });

  it("clicking Set calls the transaction and shows the result", async () => {
    const updated = makeCharacter({ quiveringPalm: { saveDC: 17, active: true } });
    vi.mocked(setQuiveringPalmTransaction).mockResolvedValue({
      character: updated,
      results: [{ active: true, daysRemaining: 17, summary: "Quivering Palm — set imperceptible vibrations (lasts 17 days unless triggered or ended)." }],
    });
    const character = makeCharacter();
    renderWithCharacter(
      <QuiveringPalmSection turnState={makeTurnState()} currentRow={hitRow} />,
      character,
    );

    await userEvent.click(screen.getByRole("button", { name: /Set/ }));

    expect(setQuiveringPalmTransaction).toHaveBeenCalledWith("char-1");
    expect(await screen.findByText(/lasts 17 days/)).toBeInTheDocument();
    expect(cachedCharacter("char-1")).toEqual(updated);
  });

  it("Trigger is enabled once active, consumes the Action slot, and shows the result", async () => {
    const updated = makeCharacter({ quiveringPalm: { saveDC: 17, active: false } });
    vi.mocked(triggerQuiveringPalmTransaction).mockResolvedValue({
      character: updated,
      results: [{ dc: 17, saveRoll: 10, outcome: "fail", rawDamage: 60, appliedDamage: 60, summary: "Quivering Palm — Constitution save DC 17, target rolled 10: failed — 60 Force damage." }],
    });
    const turnState = makeTurnState();
    const character = makeCharacter({ quiveringPalm: { saveDC: 17, active: true } });
    renderWithCharacter(
      <QuiveringPalmSection turnState={turnState} currentRow={null} />,
      character,
    );

    expect(screen.getByText(/Vibrations active/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Trigger/ }));

    expect(turnState.consumeAction).toHaveBeenCalledOnce();
    expect(triggerQuiveringPalmTransaction).toHaveBeenCalledWith("char-1", expect.any(Number));
    expect(await screen.findByText(/60 Force damage/)).toBeInTheDocument();
    expect(cachedCharacter("char-1")).toEqual(updated);
  });
});
