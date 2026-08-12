/**
 * The redirect button label is fully served-derived (#1435): the served
 * redirect row's own `name` plus the character's served spend-pool label, so it
 * carries the resource cost without a per-edition client literal. Pinned for
 * both editions because a regression here silently breaks the monk e2e specs
 * (the button renders but its accessible name stops matching).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

function monk(baseKey: "deflectAttacks" | "deflectMissiles", poolKey: "focus" | "ki", poolLabel: string): Character {
  return {
    id: "char-1",
    abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
    unarmedStrike: { attackBonus: 6, damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" } },
    availableActions: [{ key: baseKey, name: "Base", cost: "reaction", enabled: true }],
    resources: { pools: [{ key: poolKey, label: poolLabel, total: 5, recharge: "short-or-long", used: 0, remaining: 5 }] },
  } as unknown as Character;
}

function labelFor(character: Character, redirect: AvailableAction): string {
  const { result } = renderHookWithCharacter(
    () =>
      useDeflectAttacksReaction({
        character,
        availableActions: [redirect],
        reactionUsed: false,
        consumeReaction: vi.fn(),
        setShowReactionMenu: vi.fn(),
        setReactionMessage: vi.fn(),
        attachBatchId: vi.fn(),
      }),
    character,
  );
  return result.current.redirectLabel;
}

beforeEach(() => vi.clearAllMocks());

describe("useDeflectAttacksReaction — redirectLabel (served name + served pool label)", () => {
  it("SRD 5.2: '<row name> · spend 1 Focus Points'", () => {
    const label = labelFor(
      monk("deflectAttacks", "focus", "Focus Points"),
      { key: "deflectAttacksRedirect", name: "Deflect Attacks — Redirect", cost: "free", enabled: true },
    );
    expect(label).toBe("Deflect Attacks — Redirect · spend 1 Focus Points");
    // Substring the monk-2024 e2e matches.
    expect(label).toContain("Redirect · spend 1 Focus Points");
  });

  it("SRD 5.1: '<row name> · spend 1 Ki Points'", () => {
    const label = labelFor(
      monk("deflectMissiles", "ki", "Ki Points"),
      { key: "deflectMissilesThrow", name: "Deflect Missiles — Throw Back", cost: "free", enabled: true },
    );
    expect(label).toBe("Deflect Missiles — Throw Back · spend 1 Ki Points");
    // Substring the monk-2014 e2e matches.
    expect(label).toContain("Throw Back · spend 1 Ki Points");
  });

  it("falls back to the bare served name when no focus/ki pool is served (button still labelled)", () => {
    const noPool = {
      id: "char-1",
      abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
      unarmedStrike: { attackBonus: 6, damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" } },
      availableActions: [{ key: "deflectAttacks", name: "Base", cost: "reaction", enabled: true }],
      resources: { pools: [] },
    } as unknown as Character;
    const label = labelFor(noPool, { key: "deflectAttacksRedirect", name: "Deflect Attacks — Redirect", cost: "free", enabled: true });
    expect(label).toBe("Deflect Attacks — Redirect");
  });
});
