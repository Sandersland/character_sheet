import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CombatUtilityStrip from "@/features/session/CombatUtilityStrip";
import * as client from "@/api/client";
import type { Character, ConditionsState } from "@/types/character";

// The strip drives conditions through the shared ConditionsSheetBody (which
// batches ops via applyConditionTransactions) and rest through RestButton.
vi.mock("@/api/client", () => ({
  applyConditionTransactions: vi.fn(),
  applyHitPointOperations: vi.fn(),
}));

function makeCharacter(conditions: ConditionsState): Character {
  return {
    id: "char-1",
    conditions,
    hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 5, spent: 0, die: "d10" },
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CombatUtilityStrip (#982)", () => {
  it("shows a single compact line — 'none' + Exhaustion + Rest — with nothing active", () => {
    render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText("Exhaustion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rest" })).toBeInTheDocument();
    // The full-height empty-state card is NOT rendered inline.
    expect(screen.queryByText(/no active conditions/i)).not.toBeInTheDocument();
  });

  it("renders active-condition chips as labels (never raw keys)", () => {
    render(
      <CombatUtilityStrip
        character={makeCharacter({
          active: [{ key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" }],
          exhaustion: 0,
        })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.queryByText("poisoned")).not.toBeInTheDocument();
  });

  // a11y (#989 review): the manage-conditions button's accessible name must name
  // the active conditions (via conditionLabel), never leave them hidden.
  it("the manage-conditions accessible name lists active condition labels", () => {
    render(
      <CombatUtilityStrip
        character={makeCharacter({
          active: [
            { key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" },
            { key: "stunned", appliedAt: "2026-01-01T00:00:00.000Z" },
          ],
          exhaustion: 0,
        })}
        onUpdate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /manage conditions: poisoned, stunned/i }),
    ).toBeInTheDocument();
  });

  it("the manage-conditions accessible name is unadorned when nothing is active", () => {
    render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );
    // Exactly "Manage conditions" (no trailing ": ..." list).
    expect(screen.getByRole("button", { name: "Manage conditions" })).toBeInTheDocument();
  });

  it("opens the add-condition picker as an overlay and applies a condition", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={onUpdate} />,
    );

    // "+ Add" opens the picker already expanded (no extra inline expand click).
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    const proneRow = screen.getByText("Prone").closest("li")!;
    await user.click(within(proneRow).getByRole("button", { name: "Apply" }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "applyCondition", key: "prone" }]);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("removes a condition through the transaction endpoint", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(
      <CombatUtilityStrip
        character={makeCharacter({
          active: [{ key: "stunned", appliedAt: "2026-01-01T00:00:00.000Z" }],
          exhaustion: 0,
        })}
        onUpdate={vi.fn()}
      />,
    );

    // Active-condition summary button — its name now carries the condition list.
    await user.click(screen.getByRole("button", { name: /manage conditions: stunned/i }));
    await user.click(screen.getByRole("button", { name: /remove stunned/i }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "removeCondition", key: "stunned" }]);
  });

  it("changes exhaustion through the transaction endpoint", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 3 }));

    render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 2 })} onUpdate={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /manage conditions and exhaustion/i }));
    await user.click(screen.getByRole("button", { name: /increase exhaustion/i }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setExhaustion", level: 3 }]);
  });
});
