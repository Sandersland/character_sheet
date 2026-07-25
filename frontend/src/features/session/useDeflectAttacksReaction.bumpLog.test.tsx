/**
 * GENUINE RED (plan #1283 §3/§9.2): once a mutation writes the character
 * cache directly, calling `onUpdate` from inside the mutation is no longer
 * NEEDED for the sheet to update — but `useCombatLifecycle.handleCharacterUpdate`
 * piggybacks a session-log bump on that same call. If a migrated hook stopped
 * calling `onUpdate` (relying purely on the cache write), the bump would
 * silently stop firing with no other test catching it. This composes the real
 * useCombatLifecycle with the real useDeflectAttacksReaction — the actual
 * production wiring, not a mock of either — to pin that the bump still fires.
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
  return { refresh: vi.fn().mockResolvedValue(undefined), setEndedSession: vi.fn(), bumpLog: vi.fn() };
}

beforeEach(() => vi.clearAllMocks());

describe("useDeflectAttacksReaction + useCombatLifecycle (session-log bump, #1283)", () => {
  it("still bumps the session log after a successful redirect mutation", async () => {
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
    expect(live.bumpLog).toHaveBeenCalledTimes(1);
  });
});
