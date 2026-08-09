/**
 * An enabled Deflect button must never silently no-op (#1435 review): when the
 * served row is missing its resolved `effect` spec (a stale serialized
 * character), the click surfaces an error toast instead of swallowing itself,
 * and leaves the reaction unspent so a refetch can retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";

import { useDeflectAttacksReaction } from "@/features/session/useDeflectAttacksReaction";
import { renderHookWithCharacter } from "@/test/renderWithCharacter";
import type { AvailableAction, Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyActionTransactions: vi.fn(),
  leaveSession: vi.fn(),
  endSession: vi.fn(),
  endSoloSession: vi.fn(),
  applyExperienceOperations: vi.fn(),
}));
vi.mock("@/features/session/turnStatePersistence", () => ({ clearTurnState: vi.fn() }));

// A Monk served the deflectAttacks row WITHOUT an `effect` spec — the enabled
// button a stale character can present before the resolved spec is in hand.
function monkMissingSpec(): Character {
  return {
    id: "char-1",
    level: 5,
    abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
    unarmedStrike: { attackBonus: 6, damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" } },
    availableActions: [{ key: "deflectAttacks", name: "Deflect Attacks", cost: "reaction", enabled: true }],
  } as unknown as Character;
}

beforeEach(() => vi.clearAllMocks());

describe("useDeflectAttacksReaction — missing served spec", () => {
  it("surfaces an error toast and does NOT consume the reaction when the row has no effect spec", () => {
    const character = monkMissingSpec();
    const consumeReaction = vi.fn();
    const setReactionMessage = vi.fn();
    const setShowReactionMenu = vi.fn();

    const { result } = renderHookWithCharacter(
      () =>
        useDeflectAttacksReaction({
          character,
          availableActions: character.availableActions as AvailableAction[],
          reactionUsed: false,
          consumeReaction,
          setShowReactionMenu,
          setReactionMessage,
          attachBatchId: vi.fn(),
        }),
      character,
    );

    act(() => result.current.handleDeflectAttacks());

    expect(setReactionMessage).toHaveBeenCalledWith(expect.stringMatching(/reload the character sheet and try again/i));
    // The click did not fire the reaction — no slot spent, so a refetch can retry.
    expect(consumeReaction).not.toHaveBeenCalled();
  });
});
