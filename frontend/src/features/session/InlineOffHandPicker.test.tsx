import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineOffHandPicker from "@/features/session/InlineOffHandPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { logRoll } from "@/api/client";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import { IMPROVISED_ROW, UNARMED_ROW, attackRow } from "@/test/attackRowFixtures";
import type { AttackRow } from "@character-sheet/shared-types";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  logRoll: vi.fn().mockResolvedValue(undefined),
  castManeuverTransaction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeTurnState(bonusAttack: { total: number; used: number } | null) {
  return {
    bonusAttack,
    bonusActionUsed: true,
    attackTally: [],
    recordTwfAttack: vi.fn(),
    cancelTwf: vi.fn(),
    setTallyDamage: vi.fn(),
    setTallyAttackTotal: vi.fn(),
    addTallyDamageRider: vi.fn(),
    setTallyVerdict: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

// The off-hand row the server would serve for the dagger below. `damageModifier`
// is the number the server already resolved (#1434) — this sheet does no
// subtraction of its own, so a test about the Two-Weapon Fighting style states the
// modifier the style would have preserved rather than taking the feat.
function offHandDaggerRow(damageModifier: number): AttackRow {
  return attackRow({
    id: "off",
    kind: "weapon",
    name: "Dagger",
    grip: "one-handed",
    damageType: "piercing",
    offHand: true,
    attackSpec: { count: 1, faces: 20, modifier: 5 },
    damageSpec: { count: 1, faces: 6, modifier: damageModifier },
  });
}

// Two equipped light weapons: a main-hand Shortsword and an OFF_HAND dagger whose
// damage snapshot carries STR +3 folded into damageModifier (abilityModifier: 3).
function twoWeaponCharacter(
  overrides: Partial<Character> = {},
  offHand: AttackRow | null = offHandDaggerRow(0),
): Character {
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
  const mainHandRow = attackRow({
    id: "main",
    kind: "weapon",
    name: "Shortsword",
    grip: "one-handed",
    damageType: "slashing",
    attackSpec: { count: 1, faces: 20, modifier: 5 },
    damageSpec: { count: 1, faces: 6, modifier: 3 },
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
    advancements: [],
    attackRows: [mainHandRow, ...(offHand ? [offHand] : []), UNARMED_ROW, IMPROVISED_ROW],
    ...overrides,
  } as unknown as Character;
}

function renderPicker(
  character: Character,
  turnState: TurnState & TurnStateActions,
  handlers: Partial<{ onClose: () => void; onCancel: () => void; variant: "twf" | "unarmed" }> = {},
) {
  return renderWithCharacter(
    <RollProvider>
      <InlineOffHandPicker
        turnState={turnState}
        sessionId="sess-1"
        variant={handlers.variant}
        onClose={handlers.onClose ?? vi.fn()}
        onCancel={handlers.onCancel ?? vi.fn()}
        onLogChanged={vi.fn()}
      />
    </RollProvider>,
    character,
  );
}

describe("InlineOffHandPicker (#813 redesign)", () => {
  it("renders the off-hand form with the '(off-hand)' tag and the ability mod dropped (no style)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText("Dagger (off-hand)")).toBeInTheDocument();
    // STR +3 dropped → 1d6 piercing (no modifier shown).
    expect(screen.getByText(/1d6 piercing/)).toBeInTheDocument();
    expect(screen.queryByText(/1d6 \+ 3/)).not.toBeInTheDocument();
  });

  // With the Two-Weapon Fighting style the SERVER keeps the ability mod on the
  // off-hand row (deriveOffHandDamage); this sheet just has to label what it is
  // served, so the fixture serves the un-reduced modifier rather than the feat.
  it("labels the full ability mod when the served off-hand row kept it (TWF style)", () => {
    const character = twoWeaponCharacter({}, offHandDaggerRow(3));
    renderPicker(character, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText(/1d6 \+ 3 piercing/)).toBeInTheDocument();
  });

  it("uses the same step-rail shell as the main sheet (Roll to hit → Damage, one swing)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByRole("button", { name: /Roll to hit/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll damage/ })).toBeInTheDocument();
    // Single form → no "Attacking with" selector.
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("spends the bonus action and logs an attack roll when the off-hand swing is rolled", async () => {
    const turnState = makeTurnState({ total: 1, used: 0 });
    renderPicker(twoWeaponCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordTwfAttack).toHaveBeenCalledOnce();
    expect(turnState.recordTwfAttack).toHaveBeenCalledWith(
      expect.objectContaining({ source: "bonusAction", formName: "Dagger (off-hand)" }),
    );
    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "attack", source: "Dagger" }),
    );
  });

  it("shows Cancel — refund bonus action before the swing is rolled", () => {
    const onCancel = vi.fn();
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }), { onCancel });
    expect(screen.getByRole("button", { name: /Cancel — refund bonus action/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  it("shows Done and disables Roll to hit once the swing is spent (bonusAttack cleared)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState(null));
    expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll to hit/ })).toBeDisabled();
  });

  it("offers the Battle Master maneuvers disclosure on the off-hand swing (RAW)", () => {
    const bm = twoWeaponCharacter({
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
        ],
        maneuversKnown: [],
      },
    } as unknown as Partial<Character>);
    renderPicker(bm, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByRole("button", { name: /Battle Master maneuvers/ })).toBeInTheDocument();
  });

  it("variant=unarmed renders the Unarmed Strike form, no weapon toggle (#1218)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }), { variant: "unarmed" });
    expect(screen.getByText("Unarmed Strike")).toBeInTheDocument();
    expect(screen.queryByText("Dagger (off-hand)")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("variant=unarmed ignores equipped weapons entirely, even with no off-hand weapon", () => {
    // No served off-hand row, so variant=twf would hit the "No off-hand weapon
    // equipped" branch — the unarmed row is always served, so this swing is not.
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
    }, null);
    renderPicker(solo, makeTurnState({ total: 1, used: 0 }), { variant: "unarmed" });
    expect(screen.getByText("Unarmed Strike")).toBeInTheDocument();
    expect(screen.queryByText(/No off-hand weapon equipped/i)).not.toBeInTheDocument();
  });

  it("variant=unarmed spends the bonus action and records the swing as Unarmed Strike", async () => {
    const turnState = makeTurnState({ total: 1, used: 0 });
    renderPicker(twoWeaponCharacter(), turnState, { variant: "unarmed" });

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordTwfAttack).toHaveBeenCalledOnce();
    expect(turnState.recordTwfAttack).toHaveBeenCalledWith(
      expect.objectContaining({ source: "bonusAction", formName: "Unarmed Strike" }),
    );
    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "attack", source: "Unarmed Strike" }),
    );
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
    }, null);
    renderPicker(solo, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText(/No off-hand weapon equipped/i)).toBeInTheDocument();
  });
});
