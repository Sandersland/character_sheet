import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { applyInventoryTransactions, logRoll } from "@/api/client";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  applyInventoryTransactions: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

const mockApplyInventory = vi.mocked(applyInventoryTransactions);

beforeEach(() => {
  vi.clearAllMocks();
});

// Minimal turn state: an Attack action in progress with one attack available.
const turnState = {
  attack: { total: 1, used: 0 },
  bonusActionUsed: false,
  reactionUsed: false,
  recordAttack: vi.fn(),
  consumeBonusAction: vi.fn(),
  consumeReaction: vi.fn(),
} as unknown as TurnState & TurnStateActions;

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    inventory: [],
    attacksPerAction: 1,
    unarmedStrike: {
      attackBonus: 2,
      damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" },
    },
    improvisedWeapon: {
      attackBonus: 2,
      damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" },
      proficient: false,
    },
    resources: { pools: [] },
    ...overrides,
  } as unknown as Character;
}

function renderPicker(character: Character, onUpdate = vi.fn(), onLogChanged = vi.fn()) {
  return render(
    <RollProvider>
      <InlineAttackPicker
        character={character}
        turnState={turnState}
        sessionId="sess-1"
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
      />
    </RollProvider>,
  );
}

const unequippedWeapon = {
  id: "inv-1",
  name: "Longsword",
  category: "weapon" as const,
  quantity: 1,
  equipped: false,
  weapon: {
    damageDiceCount: 1,
    damageDiceFaces: 8,
    damageModifier: 0,
    damageType: "slashing",
  },
};

describe("InlineAttackPicker — inline equip affordance", () => {
  it("references the Inventory tab in the empty state, not the character sheet", () => {
    renderPicker(makeCharacter({ inventory: [] }));
    const empty = screen.getByText(/No weapons equipped/i);
    expect(empty.textContent).toMatch(/Inventory tab/i);
    expect(empty.textContent).not.toMatch(/character sheet/i);
  });

  it("renders an Equip button for an owned-but-unequipped weapon", () => {
    renderPicker(makeCharacter({ inventory: [unequippedWeapon] as unknown as Character["inventory"] }));
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Equip$/ })).toBeInTheDocument();
  });

  it("fires the setEquipped op and refreshes when Equip is clicked", async () => {
    const onUpdate = vi.fn();
    const equippedChar = makeCharacter({
      inventory: [{ ...unequippedWeapon, equipped: true }] as unknown as Character["inventory"],
    });
    mockApplyInventory.mockResolvedValue(equippedChar);

    renderPicker(
      makeCharacter({ inventory: [unequippedWeapon] as unknown as Character["inventory"] }),
      onUpdate,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Equip$/ }));

    expect(mockApplyInventory).toHaveBeenCalledWith("char-1", [
      { type: "setEquipped", inventoryItemId: "inv-1", equipped: true },
    ]);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(equippedChar));
  });

  it("does not show the equip affordance when there are no unequipped weapons", () => {
    renderPicker(makeCharacter({ inventory: [] }));
    expect(screen.queryByText("Equip a weapon")).not.toBeInTheDocument();
  });

  it("shows the attacks-per-Attack-action count", () => {
    renderPicker(makeCharacter({ attacksPerAction: 3 }));
    expect(screen.getByText(/Attacks:\s*3/)).toBeInTheDocument();
  });
});

// An equipped weapon carrying a dice-valued on-hit passiveBonus capability.
function flameTongue(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-flame",
    name: "Flame Tongue",
    category: "weapon" as const,
    quantity: 1,
    equipped: true,
    attuned: true,
    requiresAttunement: true,
    weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", attackBonus: 3 },
    capabilities: [{ kind: "passiveBonus", target: "damage", op: "add", dice: { count: 2, faces: 6, damageType: "fire" } }],
    ...overrides,
  };
}

describe("InlineAttackPicker — on-hit dice riders", () => {
  it("renders a typed rider button for an attuned Flame Tongue and rolls it with the fire type", async () => {
    const onLogChanged = vi.fn();
    renderPicker(
      makeCharacter({ inventory: [flameTongue()] as unknown as Character["inventory"] }),
      vi.fn(),
      onLogChanged,
    );

    const riderButton = screen.getByRole("button", { name: /Roll \+2d6 fire/ });
    expect(riderButton).toBeInTheDocument();

    await userEvent.click(riderButton);

    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "damage", source: "Flame Tongue", damageType: "fire" }),
    );
  });

  it("hides the rider when the attunement-required weapon is unattuned", () => {
    renderPicker(
      makeCharacter({ inventory: [flameTongue({ attuned: false })] as unknown as Character["inventory"] }),
    );
    expect(screen.queryByRole("button", { name: /Roll \+2d6 fire/ })).not.toBeInTheDocument();
  });

  it("shows a conditional rider's condition as reminder text", () => {
    renderPicker(
      makeCharacter({
        inventory: [
          flameTongue({
            name: "Dragon Slayer",
            capabilities: [{ kind: "passiveBonus", target: "damage", op: "add", dice: { count: 3, faces: 6 }, condition: "vs dragons" }],
          }),
        ] as unknown as Character["inventory"],
      }),
    );
    expect(screen.getByText(/vs dragons/)).toBeInTheDocument();
  });

  it("does not leak one weapon's rider onto another equipped weapon", () => {
    const plainSword = {
      id: "inv-plain",
      name: "Longsword",
      category: "weapon" as const,
      quantity: 1,
      equipped: true,
      attuned: false,
      requiresAttunement: false,
      weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", attackBonus: 2 },
    };
    renderPicker(
      makeCharacter({ inventory: [flameTongue(), plainSword] as unknown as Character["inventory"] }),
    );
    // Exactly one rider button in the whole picker — the Flame Tongue's.
    expect(screen.getAllByRole("button", { name: /Roll \+\dd\d/ })).toHaveLength(1);
  });
});
