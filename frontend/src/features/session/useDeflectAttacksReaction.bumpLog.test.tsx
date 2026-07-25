/**
 * Historically (#1283) this pinned that `useCombatLifecycle.handleCharacterUpdate`
 * bumped the session log itself. #1284 moved that responsibility to
 * `useSessionLogBumpOnCharacterWrite` (mounted once in CharacterSheetWorkspace,
 * covered by its own test) so the bump fires for every character-cache write,
 * not only ones that happened to flow through this hook — and dissolved the
 * useCombatLifecycle coupling entirely: useDeflectAttacksReaction now writes
 * straight to the cache via useCurrentCharacter(). This pins that write.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, waitFor } from "@testing-library/react";

import { useDeflectAttacksReaction } from "@/features/session/useDeflectAttacksReaction";
import { applyActionTransactions } from "@/api/client";
import { cachedCharacter, renderHookWithCharacter } from "@/test/renderWithCharacter";
import type { AvailableAction, Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyActionTransactions: vi.fn(),
  leaveSession: vi.fn(),
  endSession: vi.fn(),
  endSoloSession: vi.fn(),
  applyExperienceOperations: vi.fn(),
}));
vi.mock("@/features/session/turnStatePersistence", () => ({ clearTurnState: vi.fn() }));

const mockApply = vi.mocked(applyActionTransactions);

function makeCharacter(): Character {
  return {
    id: "char-1",
    level: 5,
    abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
    unarmedStrike: { attackBonus: 6, damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" } },
  } as unknown as Character;
}

const availableActions: AvailableAction[] = [
  { key: "deflectAttacksRedirect", name: "Deflect Attacks — Redirect", cost: "free", enabled: true, resourceKey: "focus" },
] as unknown as AvailableAction[];

beforeEach(() => vi.clearAllMocks());

describe("useDeflectAttacksReaction (character forwarding, #1284)", () => {
  it("still writes the updated character to the cache after a successful redirect mutation", async () => {
    const character = makeCharacter();
    mockApply.mockResolvedValue({ ...character, batchId: "batch-1" });

    const { result } = renderHookWithCharacter(
      () =>
        useDeflectAttacksReaction({
          character,
          availableActions,
          reactionUsed: true,
          consumeReaction: vi.fn(),
          setShowReactionMenu: vi.fn(),
          setReactionMessage: vi.fn(),
          attachBatchId: vi.fn(),
        }),
      character,
    );

    act(() => result.current.handleDeflectAttacks());
    await act(async () => {
      await result.current.handleDeflectAttacksRedirect();
    });

    await waitFor(() => expect(cachedCharacter("char-1")).toEqual(character));
  });
});
