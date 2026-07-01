import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TurnHub from "@/features/session/TurnHub";
import { useTurnState } from "@/features/session/useTurnState";
import { maneuverPlacement } from "@/lib/maneuvers";
import { RollProvider } from "@/features/dice/RollContext";
import {
  applyActionTransactions,
  applyResourceTransactions,
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
        { id: "m1", name: "Parry", description: "Reduce incoming damage." },
        { id: "m2", name: "Evasive Footwork", description: "Add the die to your AC." },
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
  await user.click(screen.getByRole("button", { name: "Start Combat" }));
  await user.click(screen.getByRole("button", { name: "Start Turn" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  const updated = makeCharacter();
  vi.mocked(applyActionTransactions).mockResolvedValue(updated);
  vi.mocked(applyResourceTransactions).mockResolvedValue(updated);
  vi.mocked(applyInventoryTransactions).mockResolvedValue(updated);
  vi.mocked(startCombat).mockResolvedValue(undefined);
  vi.mocked(endCombat).mockResolvedValue(undefined);
  vi.mocked(advanceCombatRound).mockResolvedValue(undefined);
  vi.mocked(logRoll).mockResolvedValue(undefined);
});

describe("TurnHub — combat lifecycle", () => {
  it("starts combat: logs the event and shows the round + Start Turn prompt", async () => {
    const user = userEvent.setup();
    renderHub();

    await user.click(screen.getByRole("button", { name: "Start Combat" }));

    expect(startCombat).toHaveBeenCalledWith("char-1", "sess-1");
    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Turn" })).toBeInTheDocument();
  });

  it("starts a turn: shows Your Turn with one action available", async () => {
    const user = userEvent.setup();
    renderHub();

    await startTurn(user);

    expect(screen.getByText("Your Turn")).toBeInTheDocument();
    expect(screen.getByText("1 available")).toBeInTheDocument();
  });

  it("ends the turn: advances the combat round to 2", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "End Turn" }));

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
    expect(screen.getByText("1 available")).toBeInTheDocument();
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

describe("TurnHub — Battle Master maneuvers", () => {
  it("classifies Parry as a reaction maneuver", () => {
    expect(maneuverPlacement("Parry")).toBe("reaction");
    expect(maneuverPlacement("Evasive Footwork")).toBe("effect");
  });

  it("spends a superiority die and consumes the reaction for a reaction maneuver", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Reaction/ }));
    await user.click(screen.getByRole("button", { name: /Parry \(d8\)/ }));

    await waitFor(() =>
      expect(applyResourceTransactions).toHaveBeenCalledWith("char-1", [
        { type: "spendResource", key: "superiorityDice", amount: 1, roll: expect.any(Number) },
      ]),
    );
    expect(screen.getByText(/Reaction used/i)).toBeInTheDocument();
  });

  it("spends a superiority die for an effect maneuver and shows the gold strip", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Evasive Footwork \(d8\)/ }));

    await waitFor(() =>
      expect(applyResourceTransactions).toHaveBeenCalledWith("char-1", [
        { type: "spendResource", key: "superiorityDice", amount: 1, roll: expect.any(Number) },
      ]),
    );
    expect(screen.getByText(/add \+\d+ to your AC/i)).toBeInTheDocument();
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
