import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";

import { useDeflectAttacksReaction } from "@/features/session/useDeflectAttacksReaction";
import { applyActionTransactions } from "@/api/client";
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

const mockApply = vi.mocked(applyActionTransactions);

const BASE_WITH_SPEC: AvailableAction = {
  key: "deflectAttacks",
  name: "Deflect Attacks",
  cost: "reaction",
  enabled: true,
  effect: { effectType: "utility", dice: { count: 1, faces: 10, modifier: 8 }, scaling: { mode: "none" } },
} as unknown as AvailableAction;

const REDIRECT_WITH_SPEC: AvailableAction = {
  key: "deflectAttacksRedirect",
  name: "Deflect Attacks — Redirect",
  cost: "free",
  enabled: true,
  effect: { effectType: "damage", dice: { count: 2, faces: 8, modifier: 3 }, scaling: { mode: "none" } },
} as unknown as AvailableAction;

const REDIRECT_NO_SPEC: AvailableAction = {
  key: "deflectAttacksRedirect",
  name: "Deflect Attacks — Redirect",
  cost: "free",
  enabled: true,
} as unknown as AvailableAction;

function makeCharacter(): Character {
  return {
    id: "char-1",
    abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
    unarmedStrike: { attackBonus: 6, damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" } },
    availableActions: [BASE_WITH_SPEC],
    resources: { pools: [{ key: "focus", label: "Focus Points", total: 5, recharge: "short-or-long", used: 0, remaining: 5 }] },
  } as unknown as Character;
}

function renderReaction(redirect: AvailableAction, setReactionMessage = vi.fn()) {
  const character = makeCharacter();
  const utils = renderHookWithCharacter(
    () =>
      useDeflectAttacksReaction({
        character,
        availableActions: [redirect],
        reactionUsed: false,
        consumeReaction: vi.fn(),
        setShowReactionMenu: vi.fn(),
        setReactionMessage,
        attachBatchId: vi.fn(),
      }),
    character,
  );
  return { ...utils, setReactionMessage };
}

function lastToast(setReactionMessage: ReturnType<typeof vi.fn>): string {
  const updater = setReactionMessage.mock.calls.at(-1)?.[0] as (prev: string | null) => string;
  return updater("");
}

beforeEach(() => vi.clearAllMocks());

describe("useDeflectAttacksReaction — pending resets on failure", () => {
  it("throwing redirect mutation: resets pending so the button can't re-enable, and toasts the failure", async () => {
    mockApply.mockRejectedValue(new Error("network blip"));
    const { result, setReactionMessage } = renderReaction(REDIRECT_WITH_SPEC);

    act(() => result.current.handleDeflectAttacks());
    expect(result.current.deflectRedirectAvailable).toBe(true);

    await act(async () => {
      await result.current.handleDeflectAttacksRedirect();
    });

    expect(result.current.deflectRedirectAvailable).toBe(false);
    expect(lastToast(setReactionMessage)).toMatch(/Redirect failed/i);
  });

  it("missing redirect spec: resets pending too, and toasts the failure", async () => {
    const { result, setReactionMessage } = renderReaction(REDIRECT_NO_SPEC);

    act(() => result.current.handleDeflectAttacks());
    expect(result.current.deflectRedirectAvailable).toBe(true);

    await act(async () => {
      await result.current.handleDeflectAttacksRedirect();
    });

    expect(result.current.deflectRedirectAvailable).toBe(false);
    expect(lastToast(setReactionMessage)).toMatch(/reload the character sheet/i);
    expect(mockApply).not.toHaveBeenCalled();
  });
});
