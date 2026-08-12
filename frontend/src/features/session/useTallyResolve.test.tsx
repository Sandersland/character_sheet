// #1354: rollDamageFor is the inline damage roll the AttackTallyStrip/
// Turn-summary banner offer when a player resolves a tally row — it must
// carry the row's own swingId (minted at attack time, #1235) so its damage
// event still correlates with the attack event even though this hook can't
// reach useAttackRolls' internal swingIdRef.
import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { RollProvider } from "@/features/dice/RollContext";
import { useTallyResolve } from "@/features/session/useTallyResolve";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({ logRollAction: vi.fn().mockResolvedValue(undefined) }));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    class: "Monk",
    inventory: [],
    unarmedStrike: {
      attackBonus: 2,
      damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" },
    },
    improvisedWeapon: {
      attackBonus: 2,
      damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" },
      proficient: false,
    },
    attackRows: [
      {
        id: "unarmed",
        kind: "unarmed",
        name: "Unarmed Strike",
        attackSpec: { count: 1, faces: 20, modifier: 2 },
        damageSpec: { count: 1, faces: 1, modifier: 0 },
        damageType: "bludgeoning",
        magical: false,
        offHand: false,
        damageRiders: [],
      },
    ],
    resources: { pools: [] },
    advancements: [],
    ...overrides,
  } as unknown as Character;
}

function setup(character: Character) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RollProvider characterId={character.id} sessionId="s1" rollModifiers={[]}>
      {children}
    </RollProvider>
  );
  const { result } = renderHook(
    () =>
      useTallyResolve({
        character,
        setTallyVerdict: vi.fn(),
        setTallyDamageAt: vi.fn(),
        onLogChanged: vi.fn(),
      }),
    { wrapper },
  );
  return result;
}

describe("useTallyResolve.rollDamageFor — #1354 swingId correlation", () => {
  it("logs the damage roll carrying the row's own swingId", async () => {
    const { logRollAction } = await import("@/api/client");
    const character = makeCharacter();
    const row: AttackTallyRow = {
      id: "row-1",
      source: "action",
      formId: "unarmed",
      formName: "Unarmed Strike",
      attack: { total: 12, keptFace: 10, nat20: false, nat1: false, criticalHit: false },
      swingId: "swing-abc",
    };

    const result = setup(character);
    result.current.rollDamageFor(0, row);

    expect(logRollAction).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(logRollAction).mock.calls[0][1];
    expect(payload.swingId).toBe("swing-abc");
  });
});
