import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TurnHub from "@/features/session/TurnHub";
import { useTurnState } from "@/features/session/useTurnState";
import { RollProvider } from "@/features/dice/RollContext";
import {
  applyActionTransactions,
  applyResourceTransactions,
  castManeuverTransaction,
  revertBatch,
  startCombat,
  endCombat,
  advanceCombatRound,
  applyInventoryTransactions,
  logRoll,
} from "@/api/client";
import { axe } from "@/test/axe";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyActionTransactions: vi.fn(),
  applyResourceTransactions: vi.fn(),
  castManeuverTransaction: vi.fn(),
  revertBatch: vi.fn(),
  startCombat: vi.fn(),
  endCombat: vi.fn(),
  advanceCombatRound: vi.fn(),
  applyInventoryTransactions: vi.fn(),
  logRoll: vi.fn(),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    class: "Fighter",
    subclass: "Battle Master",
    level: 5,
    inventory: [],
    hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    unarmedStrike: {
      attackBonus: 2,
      damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" },
    },
    improvisedWeapon: {
      attackBonus: 2,
      damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" },
      proficient: false,
    },
    availableActions: [
      { key: "divineSense", name: "Divine Sense", cost: "action", enabled: true },
      { key: "layOnHands", name: "Lay on Hands", cost: "action", enabled: true },
      { key: "secondWind", name: "Second Wind", cost: "bonusAction", enabled: true },
      { key: "opportunityAttack", name: "Opportunity Attack", cost: "reaction", enabled: true },
    ],
    resources: {
      features: [],
      pools: [
        { key: "actionSurge", label: "Action Surge", total: 1, recharge: "shortRest", used: 0, remaining: 1 },
        { key: "layOnHands", label: "Lay on Hands", total: 15, recharge: "longRest", used: 10, remaining: 5 },
        { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
      ],
      maneuversKnown: [
        { id: "m1", name: "Parry", description: "Reduce incoming damage.", placement: "reaction", actionSlot: "reaction" },
        { id: "m2", name: "Evasive Footwork", description: "Add the die to your AC.", placement: "effect" },
      ],
      toolProficienciesKnown: [],
    },
    ...overrides,
  } as unknown as Character;
}

function Harness({
  character,
  onUpdate,
  onLogChanged,
}: {
  character: Character;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
}) {
  const turnState = useTurnState(character, "sess-1");
  return (
    <TurnHub
      character={character}
      sessionId="sess-1"
      turnState={turnState}
      onUpdate={onUpdate}
      onLogChanged={onLogChanged}
      allies={[]}
    />
  );
}

function renderHub(character: Character = makeCharacter()) {
  const onUpdate = vi.fn();
  const onLogChanged = vi.fn();
  const result = render(
    <RollProvider>
      <Harness character={character} onUpdate={onUpdate} onLogChanged={onLogChanged} />
    </RollProvider>,
  );
  return { ...result, onUpdate, onLogChanged };
}

// Drive the hub from "Not in Combat" through to an active turn.
async function startTurn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Start combat/ }));
  await user.click(screen.getByRole("button", { name: "Start my turn" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  const updated = makeCharacter();
  vi.mocked(applyActionTransactions).mockResolvedValue(updated);
  vi.mocked(applyResourceTransactions).mockResolvedValue(updated);
  vi.mocked(castManeuverTransaction).mockResolvedValue({
    character: updated,
    results: [{ roll: 5, saveDc: null, summary: "used maneuver" }],
  });
  vi.mocked(applyInventoryTransactions).mockResolvedValue(updated);
  vi.mocked(revertBatch).mockResolvedValue(updated);
  vi.mocked(startCombat).mockResolvedValue(undefined);
  vi.mocked(endCombat).mockResolvedValue(undefined);
  vi.mocked(advanceCombatRound).mockResolvedValue(undefined);
  vi.mocked(logRoll).mockResolvedValue(undefined);
});

describe("TurnHub — combat lifecycle", () => {
  it("starts combat: logs the event and shows the round + Start Turn prompt", async () => {
    const user = userEvent.setup();
    renderHub();

    await user.click(screen.getByRole("button", { name: /Start combat/ }));

    expect(startCombat).toHaveBeenCalledWith("char-1", "sess-1");
    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start my turn" })).toBeInTheDocument();
  });

  it("starts a turn: shows Your turn with the action available", async () => {
    const user = userEvent.setup();
    renderHub();

    await startTurn(user);

    expect(screen.getByText("Your turn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Action" })).toBeInTheDocument();
  });

  it("ends the turn: advances the combat round to 2", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "End turn" }));

    expect(advanceCombatRound).toHaveBeenCalledWith("char-1", "sess-1", 2);
    expect(screen.getByText(/Round 2/)).toBeInTheDocument();
  });
});

describe("TurnHub — action economy", () => {
  it("consumes the action for a universal action without a server call", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Dodge" }));

    expect(applyActionTransactions).not.toHaveBeenCalled();
    expect(screen.getByText("used")).toBeInTheDocument();
  });

  it("Undo restores the action after a consuming click (#730)", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    // No undo affordance until something is spent.
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Dodge" }));
    expect(screen.getByText("used")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Undo/ }));

    // Action available again; the undo affordance is gone.
    expect(screen.getByRole("button", { name: "Use Action" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("executes a class action through applyActionTransactions", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Divine Sense" }));

    await waitFor(() =>
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "divineSense" },
      ]),
    );
  });

  it("Action Surge executes server-side and refunds an action slot", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    // Spend the action first so the refund is observable.
    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Dodge" }));
    expect(screen.getByText("used")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Action Surge/ }));

    await waitFor(() =>
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "actionSurge" },
      ]),
    );
    // The action slot's Use button returns once the surge refunds the slot.
    expect(screen.getByRole("button", { name: "Use Action" })).toBeInTheDocument();
  });

  it("Lay on Hands opens the input and heals for the entered amount", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Lay on Hands" }));

    await user.click(screen.getByRole("button", { name: "Heal" }));

    await waitFor(() =>
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "layOnHands", roll: expect.any(Number) },
      ]),
    );
  });
});

describe("TurnHub — server-effect undo (#758)", () => {
  it("Undo of Second Wind reverts the batch server-side, then restores the slot", async () => {
    const user = userEvent.setup();
    vi.mocked(applyActionTransactions).mockResolvedValue({
      ...makeCharacter(),
      batchId: "batch-sw",
    });
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Bonus" }));
    await user.click(screen.getByRole("button", { name: "Second Wind" }));

    await waitFor(() =>
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "secondWind", roll: expect.any(Number) },
      ]),
    );

    await user.click(await screen.findByRole("button", { name: /Undo/ }));

    // Reverts THIS batch server-side, then the bonus slot is available again.
    await waitFor(() => expect(revertBatch).toHaveBeenCalledWith("char-1", "batch-sw"));
    expect(await screen.findByRole("button", { name: "Use Bonus" })).toBeInTheDocument();
  });

  it("Undo of a local-only action (Dodge) makes no server revert (regression pin)", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Dodge" }));
    await user.click(screen.getByRole("button", { name: /Undo/ }));

    expect(revertBatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use Action" })).toBeInTheDocument();
  });

  it("a failed revert keeps the slot consumed and surfaces the error (no desync)", async () => {
    const user = userEvent.setup();
    vi.mocked(applyActionTransactions).mockResolvedValue({
      ...makeCharacter(),
      batchId: "batch-sw",
    });
    vi.mocked(revertBatch).mockRejectedValue(
      new Error("Only the most recent action can be undone."),
    );
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Bonus" }));
    await user.click(screen.getByRole("button", { name: "Second Wind" }));
    await waitFor(() => expect(applyActionTransactions).toHaveBeenCalled());

    await user.click(await screen.findByRole("button", { name: /Undo/ }));

    expect(
      (await screen.findAllByText(/Only the most recent action can be undone\./)).length,
    ).toBeGreaterThan(0);
    // Slot stays consumed — no local restore on a failed revert.
    expect(screen.queryByRole("button", { name: "Use Bonus" })).not.toBeInTheDocument();
  });
});

describe("TurnHub — More-actions disclosure", () => {
  it("keeps the long tail collapsed until expanded, then a tile consumes the slot", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Action/ }));

    // Collapsed: the tail actions are not rendered yet.
    expect(screen.queryByRole("button", { name: "Hide" })).not.toBeInTheDocument();
    const disclosure = screen.getByRole("button", { name: /More actions/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    await user.click(disclosure);
    expect(screen.getByRole("button", { name: /More actions/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Hide" }));

    // Universal action: slot consumed locally, no server call.
    expect(applyActionTransactions).not.toHaveBeenCalled();
    expect(screen.getByText("used")).toBeInTheDocument();
  });

  it("renders Grapple and Shove as separate tiles", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: /More actions/ }));

    expect(screen.getByRole("button", { name: "Grapple" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shove" })).toBeInTheDocument();
  });
});

describe("TurnHub — bonus-spell cards", () => {
  function caster(): Character {
    return makeCharacter({
      class: "Cleric",
      availableActions: [],
      abilityScores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 16, charisma: 10,
      },
      spellcasting: {
        ability: "wisdom",
        spellSaveDC: 13,
        spellAttackBonus: 5,
        slots: [
          { level: 1, total: 3, used: 0 },
          { level: 2, total: 2, used: 0 },
        ],
        arcana: [],
        spells: [
          {
            id: "sp-hw", name: "Healing Word", level: 1, school: "evocation", prepared: true,
            castingTime: "1 bonus action", range: "60 feet", duration: "Instantaneous",
            description: "", effectKind: "heal", effectDiceCount: 1, effectDiceFaces: 4,
          },
          {
            id: "sp-sw", name: "Spiritual Weapon", level: 2, school: "evocation", prepared: true,
            castingTime: "1 bonus action", range: "60 feet", duration: "1 minute",
            description: "",
          },
        ],
      },
    } as unknown as Partial<Character>);
  }

  it("lists castable bonus-action spells as cards and pre-selects the tapped spell", async () => {
    const user = userEvent.setup();
    renderHub(caster());
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Bonus" }));
    expect(screen.getByRole("button", { name: "Spiritual Weapon" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Healing Word" }));

    // The cast sheet opens focused on the tapped spell only.
    expect(screen.getByText("Bonus-Action Spell")).toBeInTheDocument();
    expect(screen.getByText("Healing Word")).toBeInTheDocument();
    expect(screen.queryByText("Spiritual Weapon")).not.toBeInTheDocument();

    // The escape hatch reveals the full grouped list.
    await user.click(screen.getByRole("button", { name: "Show all spells" }));
    expect(screen.getByText("Spiritual Weapon")).toBeInTheDocument();
  });
});

describe("TurnHub — Other reaction catch-all", () => {
  it("consumes the reaction without a server call", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Reaction/ }));
    await user.click(screen.getByRole("button", { name: "Other reaction" }));

    expect(applyActionTransactions).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Use Reaction" })).not.toBeInTheDocument();
  });
});

describe("TurnHub — Battle Master maneuvers", () => {
  it("routes a reaction maneuver by its entry placement and casts via the server", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Reaction/ }));
    await user.click(screen.getByRole("button", { name: /Parry \(d8\)/ }));

    await waitFor(() =>
      expect(castManeuverTransaction).toHaveBeenCalledWith("char-1", [
        { type: "castManeuver", entryId: "m1" },
      ]),
    );
    expect(screen.getByText(/Reaction used/i)).toBeInTheDocument();
  });

  it("casts an effect maneuver by its entry id and shows the gold strip", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Evasive Footwork \(d8\)/ }));

    await waitFor(() =>
      expect(castManeuverTransaction).toHaveBeenCalledWith("char-1", [
        { type: "castManeuver", entryId: "m2" },
      ]),
    );
    expect(screen.getByText(/add \+\d+ to your AC/i)).toBeInTheDocument();
  });

  it("clears a stale maneuver error on a later successful effect maneuver", async () => {
    const user = userEvent.setup();
    vi.mocked(castManeuverTransaction)
      .mockRejectedValueOnce(new Error("Superiority die spend failed."))
      .mockResolvedValueOnce({
        character: makeCharacter(),
        results: [{ roll: 5, saveDc: null, summary: "used maneuver" }],
      });
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Evasive Footwork \(d8\)/ }));
    expect((await screen.findAllByText(/Superiority die spend failed\./i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Evasive Footwork \(d8\)/ }));
    await waitFor(() =>
      expect(screen.queryAllByText(/Superiority die spend failed\./i)).toHaveLength(0),
    );
    expect(screen.getByText(/add \+\d+ to your AC/i)).toBeInTheDocument();
  });
});

describe("TurnHub — live multi-attack counter (#757)", () => {
  function extraAttackFighter(): Character {
    return makeCharacter({
      attacksPerAction: 2,
      inventory: [
        {
          id: "inv-1",
          name: "Longsword",
          category: "weapon",
          quantity: 1,
          equipped: true,
          weapon: {
            damageDiceCount: 1,
            damageDiceFaces: 8,
            damageModifier: 3,
            damageType: "slashing",
            attackBonus: 6,
          },
        },
      ] as unknown as Character["inventory"],
    } as unknown as Partial<Character>);
  }

  async function openAttackPicker(user: ReturnType<typeof userEvent.setup>) {
    await startTurn(user);
    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: /^Attack/ }));
  }

  it("opens at 2 of 2, decrements on each Roll to hit, and disables at 0 of 2", async () => {
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    // Scope to the picker sheet — the Action tile behind it shows its own counter.
    const sheet = () => within(screen.getByRole("dialog"));

    expect(sheet().getByText(/Attacks:\s*2 of 2 remaining/)).toBeInTheDocument();

    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    expect(sheet().getByText(/Attacks:\s*1 of 2 remaining/)).toBeInTheDocument();

    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    expect(sheet().getByText(/Attacks:\s*0 of 2 remaining/)).toBeInTheDocument();
    expect(sheet().getByRole("button", { name: /Roll to hit/ })).toBeDisabled();
    // Damage stays usable under the ungated trust model.
    expect(sheet().getByRole("button", { name: /Roll damage/ })).not.toBeDisabled();
  });

  it("switches the footer from Cancel to Done after the first roll", async () => {
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    const sheet = () => within(screen.getByRole("dialog"));

    expect(sheet().getByRole("button", { name: /Cancel — refund action/ })).toBeInTheDocument();

    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));

    expect(sheet().getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    expect(sheet().queryByRole("button", { name: /Cancel — refund action/ })).not.toBeInTheDocument();
  });
});

describe("TurnHub — death saves (#736/#744)", () => {
  const downed = () =>
    makeCharacter({
      hitPoints: { current: 0, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    } as unknown as Partial<Character>);

  it("shows the death-save tracker in the active turn at 0 HP", async () => {
    const user = userEvent.setup();
    renderHub(downed());
    await startTurn(user);

    // The primary moment a downed player rolls a save is on their own turn.
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    expect(screen.getByText(/Unconscious — Roll Death Saves/i)).toBeInTheDocument();
  });
});

describe("TurnHub — accessibility", () => {
  it("has no axe violations in the active turn", async () => {
    const user = userEvent.setup();
    const { container } = renderHub();
    await startTurn(user);

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("TurnHub — Rage turn-hook (#457)", () => {
  function ragingBarbarian(): Character {
    return makeCharacter({
      class: "Barbarian",
      availableActions: [
        { key: "rage", name: "Rage", cost: "bonusAction", enabled: true },
        { key: "endRage", name: "End Rage", cost: "bonusAction", enabled: true },
      ],
      activeEffects: {
        buffs: [
          { id: "b1", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active" },
        ],
      },
    } as unknown as Partial<Character>);
  }

  it("surfaces the Rage end reminder while raging", async () => {
    const user = userEvent.setup();
    renderHub(ragingBarbarian());
    await startTurn(user);
    expect(
      screen.getByText(/Rage ends at the end of your turn.*advantage on Strength checks & saves/i),
    ).toBeInTheDocument();
  });

  it("auto-ends Rage when the turn passes with no attack or damage taken", async () => {
    const user = userEvent.setup();
    renderHub(ragingBarbarian());
    await startTurn(user);
    await user.click(screen.getByRole("button", { name: "End turn" }));
    await waitFor(() => {
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "endRage" },
      ]);
    });
  });

  it("does not fire endRage for a non-raging character", async () => {
    const user = userEvent.setup();
    renderHub(makeCharacter({ class: "Barbarian" }));
    await startTurn(user);
    await user.click(screen.getByRole("button", { name: "End turn" }));
    expect(applyActionTransactions).not.toHaveBeenCalledWith("char-1", [
      { type: "executeAction", actionKey: "endRage" },
    ]);
  });
});
