import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuiveringPalmSection from "@/features/session/QuiveringPalmSection";
import { setQuiveringPalmTransaction, triggerQuiveringPalmTransaction } from "@/api/client";
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
    quiveringPalm: { dc: 17, active: false },
    ...overrides,
  } as unknown as Character;
}

const hitRow = { id: "row-1" } as unknown as AttackTallyRow;

describe("QuiveringPalmSection (#1245)", () => {
  it("renders nothing when the character has no Quivering Palm (null)", () => {
    const { container } = render(
      <QuiveringPalmSection
        character={makeCharacter({ quiveringPalm: null })}
        turnState={makeTurnState()}
        currentRow={hitRow}
        onUpdate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("Set is disabled without a hit; Trigger is disabled while inactive", () => {
    render(
      <QuiveringPalmSection character={makeCharacter()} turnState={makeTurnState()} currentRow={null} onUpdate={vi.fn()} />,
    );
    expect(screen.getByText(/DC 17/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Set/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Trigger/ })).toBeDisabled();
  });

  it("Set is enabled once a hit lands and not yet active", () => {
    render(
      <QuiveringPalmSection character={makeCharacter()} turnState={makeTurnState()} currentRow={hitRow} onUpdate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Set/ })).toBeEnabled();
  });

  it("clicking Set calls the transaction and shows the result", async () => {
    vi.mocked(setQuiveringPalmTransaction).mockResolvedValue({
      character: makeCharacter({ quiveringPalm: { dc: 17, active: true } }),
      results: [{ active: true, daysRemaining: 17, summary: "Quivering Palm — set imperceptible vibrations (lasts 17 days unless triggered or ended)." }],
    });
    const onUpdate = vi.fn();
    render(
      <QuiveringPalmSection character={makeCharacter()} turnState={makeTurnState()} currentRow={hitRow} onUpdate={onUpdate} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Set/ }));

    expect(setQuiveringPalmTransaction).toHaveBeenCalledWith("char-1");
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByText(/lasts 17 days/)).toBeInTheDocument();
  });

  it("Trigger is enabled once active, consumes the Action slot, and shows the result", async () => {
    vi.mocked(triggerQuiveringPalmTransaction).mockResolvedValue({
      character: makeCharacter({ quiveringPalm: { dc: 17, active: false } }),
      results: [{ dc: 17, saveRoll: 10, outcome: "fail", rawDamage: 60, appliedDamage: 60, summary: "Quivering Palm — Constitution save DC 17, target rolled 10: failed — 60 Force damage." }],
    });
    const turnState = makeTurnState();
    const onUpdate = vi.fn();
    render(
      <QuiveringPalmSection
        character={makeCharacter({ quiveringPalm: { dc: 17, active: true } })}
        turnState={turnState}
        currentRow={null}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByText(/Vibrations active/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Trigger/ }));

    expect(turnState.consumeAction).toHaveBeenCalledOnce();
    expect(triggerQuiveringPalmTransaction).toHaveBeenCalledWith("char-1", expect.any(Number));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByText(/60 Force damage/)).toBeInTheDocument();
  });
});
