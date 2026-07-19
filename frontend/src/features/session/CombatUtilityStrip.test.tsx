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

  it("shows the hit-dice count inline on the mobile Rest row (#1028)", () => {
    render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );
    // hitDice total 5, none spent → 5/5d10 available, shown on the Rest row itself.
    expect(screen.getByText(/Hit dice 5\/5d10/)).toBeInTheDocument();
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
    // Accessible name is the standalone "Add condition" (#986 review), not the
    // context-dependent visible "+ Add".
    await user.click(screen.getByRole("button", { name: "Add condition" }));
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

  it("steps exhaustion up via the inline stepper (setExhaustion op)", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 3 }));

    render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 2 })} onUpdate={vi.fn()} />,
    );

    // Inline stepper — no sheet, no "manage conditions" name collision.
    await user.click(screen.getByRole("button", { name: "Increase exhaustion" }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setExhaustion", level: 3 }]);
  });

  it("steps exhaustion down via the inline stepper", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 1 }));

    render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 2 })} onUpdate={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Decrease exhaustion" }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setExhaustion", level: 1 }]);
  });

  it("disables the down-stepper at 0 and the up-stepper at the max", () => {
    const { rerender } = render(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Decrease exhaustion" })).toBeDisabled();

    rerender(
      <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 6 })} onUpdate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Increase exhaustion" })).toBeDisabled();
  });

  // #1085: the desktop header dropped HP, so the desktop utility line carries the
  // live-play HP entry. jsdom's matchMedia stub reports every query unmatched
  // (mobile), so force the desktop line to exercise it.
  it("carries the HP manage-sheet entry on the desktop line (#1085)", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
    try {
      render(
        <CombatUtilityStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: /manage hit points: 30 of 30/i }),
      ).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it("keeps 'manage conditions' as the ONLY control matching that name (no exhaustion collision)", () => {
    render(
      <CombatUtilityStrip
        character={makeCharacter({
          active: [{ key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" }],
          exhaustion: 2,
        })}
        onUpdate={vi.fn()}
      />,
    );
    // getAllByRole with a name regex would throw in strict e2e if 2 matched;
    // here we assert exactly one control carries a "manage conditions" name.
    expect(screen.getAllByRole("button", { name: /manage conditions/i })).toHaveLength(1);
  });
});
