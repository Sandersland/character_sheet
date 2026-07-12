import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineOffHandPicker from "@/features/session/InlineOffHandPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { logRoll } from "@/api/client";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeTurnState(bonusAttack: { total: number; used: number } | null) {
  return {
    bonusAttack,
    bonusActionUsed: true,
    recordTwfAttack: vi.fn(),
    cancelTwf: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

// Two equipped light weapons: a main-hand and an OFF_HAND dagger whose damage
// snapshot carries STR +3 folded into damageModifier (abilityModifier: 3).
function twoWeaponCharacter(overrides: Partial<Character> = {}): Character {
  const weapon = (name: string, id: string, slot: "MAIN_HAND" | "OFF_HAND", type: string) => ({
    id,
    name,
    category: "weapon" as const,
    quantity: 1,
    equipped: true,
    equippedSlot: slot,
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageModifier: 3,
      damageType: type,
      light: true,
      attackBonus: 5,
      damage: {
        damageDiceCount: 1,
        damageDiceFaces: 6,
        damageModifier: 3,
        abilityModifier: 3,
        damageType: type,
        grip: "one-handed" as const,
      },
    },
  });
  return {
    id: "char-1",
    name: "Tester",
    inventory: [
      weapon("Shortsword", "main", "MAIN_HAND", "slashing"),
      weapon("Dagger", "off", "OFF_HAND", "piercing"),
    ],
    attacksPerAction: 1,
    unarmedStrike: { attackBonus: 2, damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" } },
    improvisedWeapon: { attackBonus: 2, damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" }, proficient: false },
    resources: { pools: [] },
    ...overrides,
  } as unknown as Character;
}

function renderPicker(
  character: Character,
  turnState: TurnState & TurnStateActions,
  handlers: Partial<{ onClose: () => void; onCancel: () => void }> = {},
) {
  return render(
    <RollProvider>
      <InlineOffHandPicker
        character={character}
        turnState={turnState}
        sessionId="sess-1"
        onClose={handlers.onClose ?? vi.fn()}
        onCancel={handlers.onCancel ?? vi.fn()}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />
    </RollProvider>,
  );
}

describe("InlineOffHandPicker (#732)", () => {
  it("renders the OFF_HAND weapon row, with the ability mod dropped from damage (no style)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText("Dagger")).toBeInTheDocument();
    // STR +3 dropped → 1d6 piercing (no modifier shown).
    expect(screen.getByText(/1d6 piercing/)).toBeInTheDocument();
    expect(screen.queryByText(/1d6 \+ 3/)).not.toBeInTheDocument();
  });

  it("keeps the ability mod in damage WITH the Two-Weapon Fighting style", () => {
    const character = twoWeaponCharacter({
      resources: { pools: [], fightingStyle: "twoWeaponFighting" },
    } as unknown as Partial<Character>);
    renderPicker(character, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText(/1d6 \+ 3 piercing/)).toBeInTheDocument();
  });

  it("spends the bonus action and logs an attack roll when the off-hand swing is rolled", async () => {
    const turnState = makeTurnState({ total: 1, used: 0 });
    renderPicker(twoWeaponCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /^Attack$/ }));

    expect(turnState.recordTwfAttack).toHaveBeenCalledOnce();
    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "attack", source: "Dagger" }),
    );
  });

  it("shows Back (refund) before the swing is rolled", () => {
    const onCancel = vi.fn();
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }), { onCancel });
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  it("shows Done and disables Attack once the swing is spent (bonusAttack cleared)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState(null));
    expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Attack$/ })).toBeDisabled();
  });

  it("falls back to a helpful message when no off-hand weapon is equipped", () => {
    const solo = twoWeaponCharacter({
      inventory: [
        {
          id: "main",
          name: "Shortsword",
          category: "weapon",
          quantity: 1,
          equipped: true,
          equippedSlot: "MAIN_HAND",
          weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, damageType: "slashing", light: true, attackBonus: 5 },
        },
      ] as unknown as Character["inventory"],
    });
    renderPicker(solo, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText(/No off-hand weapon equipped/i)).toBeInTheDocument();
  });
});
