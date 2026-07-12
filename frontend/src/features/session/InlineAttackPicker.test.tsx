import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { logRoll, castManeuverTransaction } from "@/api/client";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  applyInventoryTransactions: vi.fn(),
  applySpellcastingTransactions: vi.fn(),
  castManeuverTransaction: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

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

interface RenderOpts {
  turnState?: TurnState & TurnStateActions;
  onCancel?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
}

function renderPicker(
  character: Character,
  onUpdate = vi.fn(),
  onLogChanged = vi.fn(),
  opts: RenderOpts = {},
) {
  const onCancel = opts.onCancel ?? vi.fn();
  const onClose = opts.onClose ?? vi.fn();
  render(
    <RollProvider>
      <InlineAttackPicker
        character={character}
        turnState={opts.turnState ?? turnState}
        sessionId="sess-1"
        onClose={onClose}
        onCancel={onCancel}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
      />
    </RollProvider>,
  );
  return { onCancel, onClose };
}

function equippedWeapon(name: string, id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    category: "weapon" as const,
    quantity: 1,
    equipped: true,
    weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", attackBonus: 3 },
    ...overrides,
  };
}

describe("InlineAttackPicker — equipped-weapon cards", () => {
  it("collapses two same-name equipped weapons into a single weapon card", () => {
    renderPicker(
      makeCharacter({
        inventory: [equippedWeapon("Dagger", "inv-1"), equippedWeapon("Dagger", "inv-2")] as unknown as Character["inventory"],
      }),
    );
    expect(screen.getAllByRole("button", { name: /Roll to hit/ })).toHaveLength(1);
  });

  it("renders one weapon card per distinct equipped weapon", () => {
    renderPicker(
      makeCharacter({
        inventory: [equippedWeapon("Longsword", "inv-1"), equippedWeapon("Dagger", "inv-2")] as unknown as Character["inventory"],
      }),
    );
    expect(screen.getAllByRole("button", { name: /Roll to hit/ })).toHaveLength(2);
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByText("Dagger")).toBeInTheDocument();
  });

  it("never surfaces an unequipped inventory weapon as a card", () => {
    renderPicker(
      makeCharacter({
        inventory: [equippedWeapon("Longsword", "inv-1", { equipped: false })] as unknown as Character["inventory"],
      }),
    );
    expect(screen.queryByText("Longsword")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Roll to hit/ })).not.toBeInTheDocument();
  });

  it("shows the turn-screen empty-state hint and Unarmed Strike when no weapon is equipped", () => {
    renderPicker(makeCharacter({ inventory: [] }));
    const hint = screen.getByText(/No weapon equipped/i);
    expect(hint.textContent).toMatch(/Change/);
    expect(hint.textContent).toMatch(/turn screen/i);
    expect(screen.getByText("Unarmed Strike")).toBeInTheDocument();
  });

});

describe("InlineAttackPicker — live attack counter (#757)", () => {
  const attackState = (total: number, used: number) =>
    ({ ...turnState, attack: { total, used } }) as unknown as TurnState & TurnStateActions;

  function withWeapon(attacksPerAction: number) {
    return makeCharacter({
      attacksPerAction,
      inventory: [equippedWeapon("Longsword", "inv-1")] as unknown as Character["inventory"],
    });
  }

  it("renders the live pip counter for a multi-attack action (2 of 2 remaining)", () => {
    renderPicker(withWeapon(2), vi.fn(), vi.fn(), { turnState: attackState(2, 0) });
    expect(screen.getByText(/Attacks:\s*2 of 2 remaining/)).toBeInTheDocument();
  });

  it("shows the counter decremented after one recorded attack (1 of 2 remaining)", () => {
    renderPicker(withWeapon(2), vi.fn(), vi.fn(), { turnState: attackState(2, 1) });
    expect(screen.getByText(/Attacks:\s*1 of 2 remaining/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled();
  });

  it("disables all Roll-to-hit buttons when exhausted but leaves Damage/Critical usable", () => {
    renderPicker(withWeapon(2), vi.fn(), vi.fn(), { turnState: attackState(2, 2) });
    expect(screen.getByText(/Attacks:\s*0 of 2 remaining/)).toBeInTheDocument();
    for (const btn of screen.getAllByRole("button", { name: /Roll to hit/ })) {
      expect(btn).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: /Roll damage/ })).not.toBeDisabled();
    for (const crit of screen.getAllByRole("button", { name: /^Critical$/ })) {
      expect(crit).not.toBeDisabled();
    }
  });

  it("hides the pip counter for a single-attack action", () => {
    renderPicker(withWeapon(1), vi.fn(), vi.fn(), { turnState: attackState(1, 0) });
    expect(screen.queryByText(/of 1 remaining/)).not.toBeInTheDocument();
  });

  it("carries no kicker copy of its own — the sheet header owns it (TurnResolutionSheets)", () => {
    renderPicker(withWeapon(2), vi.fn(), vi.fn(), { turnState: attackState(2, 0) });
    expect(screen.queryByText(/no target AC tracked/)).not.toBeInTheDocument();
  });
});

describe("InlineAttackPicker — footer", () => {
  it("offers Cancel — refund action before any attack is rolled, wired to onCancel", async () => {
    const { onCancel } = renderPicker(makeCharacter({ inventory: [] }));
    const cancel = screen.getByRole("button", { name: /Cancel — refund action/ });
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  it("switches to Done once an attack has been rolled", () => {
    const rolledTurnState = {
      ...turnState,
      attack: { total: 1, used: 1 },
    } as unknown as TurnState & TurnStateActions;
    renderPicker(makeCharacter({ inventory: [] }), vi.fn(), vi.fn(), { turnState: rolledTurnState });
    expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel — refund action/ })).not.toBeInTheDocument();
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

describe("InlineAttackPicker — critical damage button", () => {
  it("logs a doubled-dice (crit) damage roll for an equipped weapon", async () => {
    const onLogChanged = vi.fn();
    renderPicker(
      makeCharacter({ inventory: [flameTongue({ capabilities: [] })] as unknown as Character["inventory"] }),
      vi.fn(),
      onLogChanged,
    );

    // Flame Tongue base weapon damage is 1d8 slashing; a crit rolls 2d8.
    const critButton = screen.getAllByRole("button", { name: /^Critical$/ })[0];
    await userEvent.click(critButton);

    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({
        kind: "damage",
        source: "Flame Tongue",
        damageType: "slashing",
        specLabel: expect.stringContaining("(crit)"),
      }),
    );
    const call = vi.mocked(logRoll).mock.calls[0][2];
    expect(call.specLabel).toBe("2d8 (crit)");
    expect(call.faces).toHaveLength(2);
  });

  it("doubles an on-hit dice rider on a crit (Flame Tongue +2d6 → +4d6)", async () => {
    renderPicker(
      makeCharacter({ inventory: [flameTongue()] as unknown as Character["inventory"] }),
      vi.fn(),
      vi.fn(),
    );

    // Crit the weapon first — marks the row as a crit, so its rider doubles too.
    await userEvent.click(screen.getAllByRole("button", { name: /^Critical$/ })[0]);
    await userEvent.click(screen.getByRole("button", { name: /Roll \+2d6 fire/ }));

    const riderCall = vi
      .mocked(logRoll)
      .mock.calls.map((c) => c[2])
      .find((entry) => entry.damageType === "fire");
    expect(riderCall).toBeDefined();
    expect(riderCall!.specLabel).toBe("4d6 (crit)");
    expect(riderCall!.faces).toHaveLength(4);
  });

  it("keeps a dice rider single when the weapon damage was rolled normally", async () => {
    renderPicker(
      makeCharacter({ inventory: [flameTongue()] as unknown as Character["inventory"] }),
      vi.fn(),
      vi.fn(),
    );

    await userEvent.click(screen.getByRole("button", { name: /Roll damage/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll \+2d6 fire/ }));

    const riderCall = vi
      .mocked(logRoll)
      .mock.calls.map((c) => c[2])
      .find((entry) => entry.damageType === "fire");
    expect(riderCall!.specLabel).toBe("2d6");
    expect(riderCall!.faces).toHaveLength(2);
  });
});

describe("InlineAttackPicker — shared Damage card copy", () => {
  it("labels the Damage card with ungated wording (not 'land the hit')", () => {
    renderPicker(
      makeCharacter({ inventory: [equippedWeapon("Longsword", "inv-1")] as unknown as Character["inventory"] }),
    );
    expect(screen.queryByText(/land the hit/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Roll damage for your hit/)).toBeInTheDocument();
  });
});

describe("InlineAttackPicker — Damage card maneuver state resets on weapon switch (#756)", () => {
  const SERVER_ROLL = 5;

  function battleMaster(): Character {
    return makeCharacter({
      inventory: [
        equippedWeapon("Longsword", "inv-1", {
          weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", attackBonus: 5 },
        }),
        equippedWeapon("Dagger", "inv-2", {
          weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageModifier: 0, damageType: "piercing", attackBonus: 5 },
        }),
      ] as unknown as Character["inventory"],
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
        ],
        maneuversKnown: [
          { id: "m-precision", name: "Precision Attack", description: "Add to the attack roll.", placement: "attackRoll" },
        ],
      },
    } as unknown as Character);
  }

  it("re-enables the spend button on the newly active weapon after a die was spent on another", async () => {
    const user = userEvent.setup();
    vi.mocked(castManeuverTransaction).mockResolvedValue({
      character: battleMaster(),
      results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Precision Attack" }],
    } as unknown as Awaited<ReturnType<typeof castManeuverTransaction>>);

    renderPicker(battleMaster());

    // Roll to hit on the active (first) weapon so the attack maneuver section shows.
    await user.click(screen.getAllByRole("button", { name: /Roll to hit/ })[0]);
    const spend = await screen.findByRole("button", { name: /Precision Attack/ });
    await user.click(spend);
    // Spent on this weapon's context → button disabled.
    await waitFor(() => expect(spend).toBeDisabled());

    // Switch the active weapon to the Dagger, then roll to hit for it.
    await user.click(screen.getByRole("button", { name: "Select Dagger" }));
    await user.click(screen.getAllByRole("button", { name: /Roll to hit/ })[1]);

    // A fresh Damage-card instance → no die spent in the Dagger's context yet.
    const daggerSpend = await screen.findByRole("button", { name: /Precision Attack/ });
    expect(daggerSpend).not.toBeDisabled();
  });
});

describe("InlineAttackPicker — persistent inline roll result (#745)", () => {
  it("shows the attack die box after rolling to hit", async () => {
    renderPicker(
      makeCharacter({ inventory: [flameTongue({ capabilities: [] })] as unknown as Character["inventory"] }),
    );

    // No result visible until a roll happens.
    expect(screen.queryByText("d20")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    // The to-hit d20 die box now persists on the row (value is random; the
    // caption is deterministic).
    expect(screen.getByText("d20")).toBeInTheDocument();
  });

  it("shows the weapon damage die box after rolling damage", async () => {
    renderPicker(
      makeCharacter({ inventory: [flameTongue({ capabilities: [] })] as unknown as Character["inventory"] }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Roll damage/ }));

    // Flame Tongue base damage is 1d8 slashing.
    expect(screen.getByText("d8")).toBeInTheDocument();
    expect(screen.getByText("slashing")).toBeInTheDocument();
  });
});
