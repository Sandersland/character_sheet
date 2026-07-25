/**
 * Historically (#1283) this pinned that `useCombatLifecycle.handleCharacterUpdate`
 * bumped the session log itself. #1284 moved that responsibility to
 * `useSessionLogBumpOnCharacterWrite` (mounted once in CharacterSheetWorkspace,
 * covered by its own test) so the bump fires for every character-cache write,
 * not only ones that happened to flow through this hook. This composed test
 * now pins the part that's still this hook's job: `handleCharacterUpdate`
 * forwards the updated character through the real useDeflectAttacksReaction ->
 * useCombatLifecycle wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useCombatLifecycle } from "@/features/session/useCombatLifecycle";
import { useDeflectAttacksReaction } from "@/features/session/useDeflectAttacksReaction";
import { applyActionTransactions } from "@/api/client";
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

function makeLive() {
  return { refresh: vi.fn().mockResolvedValue(undefined), setEndedSession: vi.fn() };
}

beforeEach(() => vi.clearAllMocks());

describe("useDeflectAttacksReaction + useCombatLifecycle (character forwarding, #1284)", () => {
  it("still forwards the updated character after a successful redirect mutation", async () => {
    const character = makeCharacter();
    mockApply.mockResolvedValue({ ...character, batchId: "batch-1" });
    const live = makeLive();
    const setCharacter = vi.fn();

    const lifecycle = renderHook(() =>
      useCombatLifecycle({ character, session: null, onUpdate: setCharacter, live }),
    );

    const { result } = renderHook(() =>
      useDeflectAttacksReaction({
        character,
        onUpdate: lifecycle.result.current.handleCharacterUpdate,
        availableActions,
        reactionUsed: true,
        consumeReaction: vi.fn(),
        setShowReactionMenu: vi.fn(),
        setReactionMessage: vi.fn(),
        attachBatchId: vi.fn(),
      }),
    );

    act(() => result.current.handleDeflectAttacks());
    await act(async () => {
      await result.current.handleDeflectAttacksRedirect();
    });

    await waitFor(() => expect(setCharacter).toHaveBeenCalled());
  });
});
