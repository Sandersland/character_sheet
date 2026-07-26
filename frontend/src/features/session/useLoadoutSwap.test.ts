import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyInventoryTransactions } from "@/api/client";
import { useLoadoutSwap } from "@/features/session/useLoadoutSwap";
import { renderHookWithCharacter } from "@/test/renderWithCharacter";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({ applyInventoryTransactions: vi.fn() }));

function character(): Character {
  return {
    id: "char-1",
    inventory: [{ id: "item-1", name: "Longsword", equippedSlot: "MAIN_HAND" }],
  } as unknown as Character;
}

// Only the slice useLoadoutSwap reads; one Action available so a stow is payable.
function turnState(): TurnState & TurnStateActions {
  return {
    attackEquipCredits: 0,
    freeInteractionUsed: true,
    actionsRemaining: 1,
    consumeAction: vi.fn(),
    spendInteractionBudget: vi.fn(),
    refundInteractionBudget: vi.fn(),
    refundAction: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

describe("useLoadoutSwap", () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression (#1283 review): `error` folds budgetError over BOTH mutations, so
  // a reset that clears only budgetError leaves a failed swap's message on screen
  // into the next turn. Pre-migration there was one error slot and one clear.
  it("reset() clears a failed swap's error, not just the budget error", async () => {
    vi.mocked(applyInventoryTransactions).mockRejectedValue(new Error("server said no"));
    const c = character();
    const { result } = renderHookWithCharacter(() => useLoadoutSwap(c, turnState()), c);

    await act(async () => {
      await result.current.stow("MAIN_HAND");
    });
    await waitFor(() => expect(result.current.error).toBe("server said no"));

    // waitFor, not a bare read: mutation.reset() lands through TanStack's
    // batched notifier, which a synchronous act() does not flush.
    act(() => result.current.reset());
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
