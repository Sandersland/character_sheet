import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CombatUtilityStrip from "@/features/session/CombatUtilityStrip";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import * as client from "@/api/client";
import type { Character, ConditionsState } from "@/types/character";

// The strip drives conditions through the shared ConditionsSheetBody (which
// batches ops via applyConditionTransactions and also imports fetchReference
// via useReferenceData — must be present here even though these fixtures omit
// rulesEdition (skipToken keeps the query pending, so it's never actually
// called), or a future fixture that adds rulesEdition would call `undefined(...)`)
// and rest through RestButton.
vi.mock("@/api/client", () => ({
  applyConditionTransactions: vi.fn(),
  applyHitPointOperations: vi.fn(),
  fetchReference: vi.fn(),
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

// CombatUtilityStrip (and RestButton/ConditionsSheetBody nested inside) reads
// useCurrentCharacter(), so every render seeds the cache and mounts
// CurrentCharacterProvider via renderWithCharacter.
function renderStrip(character: Character) {
  const result = renderWithCharacter(<CombatUtilityStrip />, character);
  return {
    ...result,
    rerender: (next: Character) => {
      getQueryClient().setQueryData(characterKeys.detail(character.id), next);
      result.rerender(<CombatUtilityStrip />);
    },
  };
}

describe("CombatUtilityStrip (#982)", () => {
  it("shows a single compact line — 'none' + Exhaustion + Rest — with nothing active", () => {
    renderStrip(makeCharacter({ active: [], exhaustion: 0 }));
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText("Exhaustion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rest" })).toBeInTheDocument();
    // The full-height empty-state card is NOT rendered inline.
    expect(screen.queryByText(/no active conditions/i)).not.toBeInTheDocument();
  });

  it("shows the hit-dice count inline on the mobile Rest row (#1028)", () => {
    renderStrip(makeCharacter({ active: [], exhaustion: 0 }));
    // hitDice total 5, none spent → 5/5d10 available, shown on the Rest row itself.
    expect(screen.getByText(/Hit dice 5\/5d10/)).toBeInTheDocument();
  });

  it("renders active-condition chips as labels (never raw keys)", () => {
    renderStrip(
      makeCharacter({
        active: [{ key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" }],
        exhaustion: 0,
      }),
    );
    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.queryByText("poisoned")).not.toBeInTheDocument();
  });

  // a11y (#989 review): the manage-conditions button's accessible name must name
  // the active conditions (via conditionLabel), never leave them hidden.
  it("the manage-conditions accessible name lists active condition labels", () => {
    renderStrip(
      makeCharacter({
        active: [
          { key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" },
          { key: "stunned", appliedAt: "2026-01-01T00:00:00.000Z" },
        ],
        exhaustion: 0,
      }),
    );
    expect(
      screen.getByRole("button", { name: /manage conditions: poisoned, stunned/i }),
    ).toBeInTheDocument();
  });

  it("the manage-conditions accessible name is unadorned when nothing is active", () => {
    renderStrip(makeCharacter({ active: [], exhaustion: 0 }));
    // Exactly "Manage conditions" (no trailing ": ..." list).
    expect(screen.getByRole("button", { name: "Manage conditions" })).toBeInTheDocument();
  });

  it("opens the add-condition picker as an overlay and applies a condition", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    renderStrip(makeCharacter({ active: [], exhaustion: 0 }));

    // "+ Add" opens the picker already expanded (no extra inline expand click).
    // Accessible name is the standalone "Add condition" (#986 review), not the
    // context-dependent visible "+ Add".
    await user.click(screen.getByRole("button", { name: "Add condition" }));
    const proneRow = screen.getByText("Prone").closest("li")!;
    await user.click(within(proneRow).getByRole("button", { name: "Apply" }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "applyCondition", key: "prone" }]);
  });

  it("removes a condition through the transaction endpoint", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    renderStrip(
      makeCharacter({
        active: [{ key: "stunned", appliedAt: "2026-01-01T00:00:00.000Z" }],
        exhaustion: 0,
      }),
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

    renderStrip(makeCharacter({ active: [], exhaustion: 2 }));

    // Inline stepper — no sheet, no "manage conditions" name collision.
    await user.click(screen.getByRole("button", { name: "Increase exhaustion" }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setExhaustion", level: 3 }]);
  });

  it("steps exhaustion down via the inline stepper", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 1 }));

    renderStrip(makeCharacter({ active: [], exhaustion: 2 }));

    await user.click(screen.getByRole("button", { name: "Decrease exhaustion" }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setExhaustion", level: 1 }]);
  });

  it("disables the down-stepper at 0 and the up-stepper at the max", () => {
    const { rerender } = renderStrip(makeCharacter({ active: [], exhaustion: 0 }));
    expect(screen.getByRole("button", { name: "Decrease exhaustion" })).toBeDisabled();

    rerender(makeCharacter({ active: [], exhaustion: 6 }));
    expect(screen.getByRole("button", { name: "Increase exhaustion" })).toBeDisabled();
  });

  it("keeps 'manage conditions' as the ONLY control matching that name (no exhaustion collision)", () => {
    renderStrip(
      makeCharacter({
        active: [{ key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" }],
        exhaustion: 2,
      }),
    );
    // getAllByRole with a name regex would throw in strict e2e if 2 matched;
    // here we assert exactly one control carries a "manage conditions" name.
    expect(screen.getAllByRole("button", { name: /manage conditions/i })).toHaveLength(1);
  });
});
