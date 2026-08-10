import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TurnHub from "@/features/session/TurnHub";
import { useTurnState } from "@/features/session/useTurnState";
import { RollProvider } from "@/features/dice/RollContext";
import {
  applyActionTransactions,
  applyResolveActionOperations,
  applyResourceTransactions,
  castManeuverTransaction,
  revertBatch,
  startCombat,
  endCombat,
  advanceCombatRound,
  fetchCombatState,
  applyInventoryTransactions,
  logRollAction,
  rollInitiativeTransaction,
} from "@/api/client";
import { seedUniversalActions } from "@/test/universalActions";
import { axe } from "@/test/axe";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import { IMPROVISED_ROW, UNARMED_ROW, attackRow } from "@/test/attackRowFixtures";
import type { AttackRow } from "@character-sheet/shared-types";
import type { Character, SpellEconomyState } from "@/types/character";

// The cleared 5e interlock every combat mock returns (#1439).
const NO_ECON: SpellEconomyState = { bonusActionBlockedByActionSpell: false, bonusActionLimitedToCantrips: false, actionLimitedToCantrips: false };

vi.mock("@/api/client", () => ({
  applyActionTransactions: vi.fn(),
  applyResolveActionOperations: vi.fn(),
  applyResourceTransactions: vi.fn(),
  castManeuverTransaction: vi.fn(),
  revertBatch: vi.fn(),
  startCombat: vi.fn(),
  endCombat: vi.fn(),
  advanceCombatRound: vi.fn(),
  fetchCombatState: vi.fn(),
  applyInventoryTransactions: vi.fn(),
  logRollAction: vi.fn(),
  rollInitiativeTransaction: vi.fn(),
  // Must be present even though every test seeds the reference cache directly
  // and never calls it (#1430): useTurnActions' useUniversalActions imports it
  // from this same barrel, and an omitted export here is `undefined`, which the
  // query CALLS the moment it enables — the trap ConditionsStrip.test.tsx
  // documents.
  fetchReference: vi.fn(),
}));

// The turn sheets render the served attackRows (#1434); `weaponRows` states the
// weapon rows the server would have served, and the two always-present rows are
// appended. A fixture that also equips the weapon in `inventory` is doing so for
// the paper-doll surfaces, not for the attack sheets.
function makeCharacter(overrides: Partial<Character> = {}, weaponRows: AttackRow[] = []): Character {
  return {
    id: "char-1",
    name: "Tester",
    // useUniversalActions keys the reference query on this, so it must be a real
    // edition or the query stays pending (skipToken) and no universal card renders.
    rulesEdition: "EDITION_2024",
    class: "Fighter",
    subclass: "Battle Master",
    level: 5,
    inventory: [],
    offHandLocked: false,
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
      // resolverKind (#1528) — Second Wind is row-driven now; without this,
      // resolverFor's fallback synthesis never fires and the card silently
      // drops out of partitionClassActions (the exact "vanishes with no test
      // failure" hazard the ordering matters for).
      { key: "secondWind", name: "Second Wind", cost: "bonusAction", enabled: true, resolverKind: "heal-roll" },
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
    attackRows: [...weaponRows, UNARMED_ROW, IMPROVISED_ROW],
    ...overrides,
  } as unknown as Character;
}

function Harness({
  character,
  onLogChanged,
  onOpenLog,
}: {
  character: Character;
  onLogChanged: () => void;
  onOpenLog?: () => void;
}) {
  const turnState = useTurnState(character, "sess-1");
  return (
    <TurnHub
      sessionId="sess-1"
      turnState={turnState}
      onLogChanged={onLogChanged}
      allies={[]}
      onOpenLog={onOpenLog}
    />
  );
}

function renderHub(character: Character = makeCharacter(), onOpenLog?: () => void) {
  const onLogChanged = vi.fn();
  const result = renderWithCharacter(
    <RollProvider>
      <Harness character={character} onLogChanged={onLogChanged} onOpenLog={onOpenLog} />
    </RollProvider>,
    character,
  );
  return { ...result, onLogChanged };
}

// Drive the hub from "Not in Combat" through to an active turn.
async function startTurn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Start combat/ }));
  await user.click(screen.getByRole("button", { name: "Start my turn" }));
}

// TurnHub now reads the character via useCurrentCharacter() (#1284) rather than
// a frozen prop, so it re-renders off whatever's in the cache after every
// mutation. A mock that resolved with a hardcoded fresh makeCharacter() would
// silently stomp a test's specific setup (e.g. downed(), a Battle Master's
// resources) the instant any mutation landed — echo the currently-cached
// character by default instead; a test simulating a REAL server-side change
// overrides with mockResolvedValueOnce for that one call.
function echoCharacter(): Character {
  return cachedCharacter("char-1") ?? makeCharacter();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Both editions, so a test can render either without re-seeding.
  seedUniversalActions("EDITION_2024");
  seedUniversalActions("EDITION_2014");
  vi.mocked(applyActionTransactions).mockImplementation(async () => echoCharacter());
  vi.mocked(applyResolveActionOperations).mockImplementation(async () => echoCharacter());
  vi.mocked(applyResourceTransactions).mockImplementation(async () => echoCharacter());
  vi.mocked(castManeuverTransaction).mockImplementation(async () => ({
    character: echoCharacter(),
    results: [{ roll: 5, saveDc: null, summary: "used maneuver" }],
  }));
  vi.mocked(applyInventoryTransactions).mockImplementation(async () => echoCharacter());
  vi.mocked(revertBatch).mockImplementation(async () => echoCharacter());
  // #1030: these resolve the server's authoritative CombatState, which
  // useTurnActions dispatches into the tracker via syncCombat. Distinct,
  // increasing updatedAt per lifecycle stage — syncCombat drops a sync whose
  // updatedAt doesn't strictly advance past the last one applied, so a real
  // start→round-advance→end sequence must never tie.
  vi.mocked(startCombat).mockResolvedValue({ round: 1, combatActive: true, updatedAt: "2026-01-01T00:00:01.000Z", spellEconomy: NO_ECON });
  vi.mocked(advanceCombatRound).mockResolvedValue({ round: 2, combatActive: true, updatedAt: "2026-01-01T00:00:02.000Z", spellEconomy: NO_ECON });
  vi.mocked(endCombat).mockResolvedValue({ round: 0, combatActive: false, updatedAt: "2026-01-01T00:00:03.000Z", spellEconomy: NO_ECON });
  vi.mocked(logRollAction).mockResolvedValue(undefined as never);
  // No onInitiative pools on this fixture (a Fighter) — a real rollInitiative
  // call would report an empty regen, same as this default (#1239/#1243).
  vi.mocked(rollInitiativeTransaction).mockImplementation(async () => ({
    ...echoCharacter(),
    results: [],
  }));
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

    // No round number is sent — the server decides it (#1030) and the
    // displayed round comes from its response via syncCombat.
    expect(advanceCombatRound).toHaveBeenCalledWith("char-1", "sess-1");
    await waitFor(() => expect(screen.getByText(/Round 2/)).toBeInTheDocument());
  });

  // #1030 finding #1: a failed startCombat/endCombat must not strand the
  // client on its optimistic guess — it re-fetches and reconciles onto the
  // server's real state instead.
  it("a failed endCombat reconciles onto the server's real (still-active) state instead of sticking on the optimistic 'ended'", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getByRole("button", { name: /Start combat/ }));
    expect(screen.getByText(/Round 1/)).toBeInTheDocument();

    // The End Combat call fails — the server never actually left combat.
    vi.mocked(endCombat).mockRejectedValueOnce(new Error("network blip"));
    // Re-fetch reports the truth: still active, at the same round/timestamp
    // as the last confirmed sync (the failed call changed nothing server-side).
    vi.mocked(fetchCombatState).mockResolvedValueOnce({
      round: 1,
      combatActive: true,
      updatedAt: "2026-01-01T00:00:01.000Z",
      spellEconomy: NO_ECON,
    });

    await user.click(screen.getByRole("button", { name: "End combat" }));

    // Reconciled back to "in combat" — NOT stuck showing the optimistic exit.
    await waitFor(() => expect(fetchCombatState).toHaveBeenCalledWith("char-1", "sess-1"));
    await waitFor(() => expect(screen.getByText(/Round 1/)).toBeInTheDocument());
    expect(screen.queryByText("Not in combat")).not.toBeInTheDocument();
  });

  it("a failed startCombat reconciles onto the server's real (still-inactive) state instead of sticking on the optimistic 'started'", async () => {
    const user = userEvent.setup();
    renderHub();

    vi.mocked(startCombat).mockRejectedValueOnce(new Error("network blip"));
    // Re-fetch reports the truth: combat never actually started.
    vi.mocked(fetchCombatState).mockResolvedValueOnce({
      round: 0,
      combatActive: false,
      updatedAt: "2026-01-01T00:00:00.500Z",
      spellEconomy: NO_ECON,
    });

    await user.click(screen.getByRole("button", { name: /Start combat/ }));

    await waitFor(() => expect(fetchCombatState).toHaveBeenCalledWith("char-1", "sess-1"));
    // Reconciled back to "not in combat" — NOT stuck showing the optimistic Round 1.
    await waitFor(() => expect(screen.getByText("Not in combat")).toBeInTheDocument());
  });

  it("reconcile-after-failure itself failing leaves the optimistic state in place (documented double-failure fallback)", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getByRole("button", { name: /Start combat/ }));
    expect(screen.getByText(/Round 1/)).toBeInTheDocument();

    vi.mocked(endCombat).mockRejectedValueOnce(new Error("network blip"));
    vi.mocked(fetchCombatState).mockRejectedValueOnce(new Error("network blip too"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await user.click(screen.getByRole("button", { name: "End combat" }));

    await waitFor(() => expect(fetchCombatState).toHaveBeenCalledWith("char-1", "sess-1"));
    // Both calls failed: the client is left on its last-applied (optimistic)
    // value rather than a freshly-guessed one — see reconcileCombatAfterFailure's
    // why-comment in useTurnActions.ts.
    expect(screen.getByText("Not in combat")).toBeInTheDocument();
    consoleError.mockRestore();
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

describe("TurnHub — deferred item/heal commit (#765)", () => {
  function itemUser(): Character {
    return makeCharacter({
      inventory: [
        {
          id: "inv-potion",
          name: "Potion of Healing",
          category: "consumable",
          quantity: 2,
          consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2 },
        },
      ] as unknown as Character["inventory"],
    } as unknown as Partial<Character>);
  }

  async function openItemPicker(user: ReturnType<typeof userEvent.setup>) {
    await startTurn(user);
    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Use an item" }));
  }

  it("Use an item → Close without using is free: no server call, action stays", async () => {
    const user = userEvent.setup();
    renderHub(itemUser());
    await openItemPicker(user);

    await user.click(within(screen.getByRole("dialog")).getByText("Close"));

    expect(applyActionTransactions).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use Action" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("Using an item consumes it server-side and commits the action", async () => {
    const user = userEvent.setup();
    renderHub(itemUser());
    await openItemPicker(user);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Use" }));

    await waitFor(() =>
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "useObject", inventoryItemId: "inv-potion", roll: expect.any(Number) },
      ]),
    );
    // Action committed only now — the slot reads "used".
    expect(screen.getByText("used")).toBeInTheDocument();
  });

  it("Undo of a used item reverts the batch server-side, then restores the action", async () => {
    const user = userEvent.setup();
    vi.mocked(applyActionTransactions).mockResolvedValue({ ...itemUser(), batchId: "batch-item" });
    renderHub(itemUser());
    await openItemPicker(user);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Use" }));
    await waitFor(() => expect(applyActionTransactions).toHaveBeenCalled());

    await user.click(await screen.findByRole("button", { name: /Undo/ }));

    await waitFor(() => expect(revertBatch).toHaveBeenCalledWith("char-1", "batch-item"));
    expect(await screen.findByRole("button", { name: "Use Action" })).toBeInTheDocument();
  });

  it("Lay on Hands → Close without healing is free: no server call, action stays", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Lay on Hands" }));
    await user.click(within(screen.getByRole("dialog")).getByText("Close"));

    expect(applyActionTransactions).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use Action" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("Undo of Lay on Hands reverts the batch server-side, then restores the action", async () => {
    const user = userEvent.setup();
    vi.mocked(applyActionTransactions).mockResolvedValue({ ...makeCharacter(), batchId: "batch-loh" });
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

    await user.click(await screen.findByRole("button", { name: /Undo/ }));

    await waitFor(() => expect(revertBatch).toHaveBeenCalledWith("char-1", "batch-loh"));
    expect(await screen.findByRole("button", { name: "Use Action" })).toBeInTheDocument();
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

    // No `roll` (#1528) — Second Wind is server-rolled now; the client sends
    // a bare executeAction and the server reports the roll back in `results`.
    await waitFor(() =>
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "secondWind" },
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
    } as unknown as Partial<Character>,
      [
        attackRow({
          id: "inv-1",
          kind: "weapon",
          name: "Longsword",
          grip: "one-handed",
          damageType: "slashing",
          attackSpec: { count: 1, faces: 20, modifier: 6 },
          damageSpec: { count: 1, faces: 8, modifier: 3 },
        }),
      ],
    );
  }

  async function openAttackPicker(user: ReturnType<typeof userEvent.setup>) {
    await startTurn(user);
    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: /^Attack/ }));
  }

  it("the sheet-header kicker reads the live count, not a static '1 attack'", async () => {
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    const sheet = () => within(screen.getByRole("dialog"));

    expect(
      sheet().getByText(/2 attacks · no target AC tracked — read the roll to your DM/),
    ).toBeInTheDocument();
  });

  it("opens at 2 of 2, decrements per attack as each swing is rolled, and exhausts at 0 of 2", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // deterministic: no nat 20/1 auto-verdicts
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    // Scope to the picker sheet — the Action tile behind it shows its own counter.
    const sheet = () => within(screen.getByRole("dialog"));

    expect(sheet().getByText(/Attacks · 2 of 2 remaining/)).toBeInTheDocument();

    // Rewired to the shared resolver (#1827 Slice 5, #1832): a swing now
    // resolves fully (roll to hit → implicit-hit damage → Done) before the
    // rail re-arms itself for the next one — the old "Skip" escape hatch
    // (leave a row unresolved) doesn't exist on ResolutionRail (#1831).
    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    expect(sheet().getByText(/Attacks · 1 of 2 remaining/)).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: /^Roll damage$/ }));
    await user.click(sheet().getByRole("button", { name: /^Done$/ }));

    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    expect(sheet().getByText(/Attacks · 0 of 2 remaining/)).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: /^Roll damage$/ }));
    // Exhausted after this swing's own Done — no further Roll-to-hit affordance.
    await user.click(sheet().getByRole("button", { name: /^Done$/ }));
    expect(sheet().queryByRole("button", { name: /Roll to hit/ })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("footer: Cancel → Close (attacks remain) → Done (all spent) (#802)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    const sheet = () => within(screen.getByRole("dialog"));

    expect(sheet().getByRole("button", { name: /Cancel — refund action/ })).toBeInTheDocument();

    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    // One of two spent — the action stays live for Resume, so the footer reads Close.
    const closeButtons = sheet().getAllByRole("button", { name: /^Close$/ });
    expect(closeButtons.length).toBeGreaterThan(0);
    expect(sheet().queryByRole("button", { name: /Cancel — refund action/ })).not.toBeInTheDocument();

    // Resolve attack 1 (damage = implicit hit) and tap the rail's own Done —
    // it re-arms the SAME rail for attack 2 (#1832), no separate "Next" tap.
    await user.click(sheet().getByRole("button", { name: /^Roll damage$/ }));
    await user.click(sheet().getByRole("button", { name: /^Done$/ }));
    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    await user.click(sheet().getByRole("button", { name: /^Roll damage$/ }));
    // Both spent — now Done (the FOOTER's, since the rail's own Done hides
    // once its swing completes with no attacks left to re-arm for).
    await user.click(sheet().getByRole("button", { name: /^Done$/ }));
    expect(sheet().getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("Resume: closing with an attack unspent keeps the action live + shows Resume (#802)", async () => {
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    const sheet = () => within(screen.getByRole("dialog"));

    await user.click(sheet().getByRole("button", { name: /Roll to hit/ })); // 1 of 2
    const closeBtns = sheet().getAllByRole("button", { name: /^Close$/ });
    await user.click(closeBtns[closeBtns.length - 1]); // footer Close

    // Sheet closed; the Action slot offers Resume for the remaining attack.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const resume = screen.getByRole("button", { name: /Resume attack — 1 of 2 remaining/ });
    expect(resume).toBeInTheDocument();

    // Reopening shows the tally with attack 1 intact.
    await user.click(resume);
    expect(within(screen.getByRole("dialog")).getByText("This action")).toBeInTheDocument();
  });

  it("Turn-summary banner: appears with tally lines once the sheet is closed, dismissible (#802/#812)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    const sheet = () => within(screen.getByRole("dialog"));

    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    await user.click(sheet().getByRole("button", { name: /^Roll damage$/ }));
    await user.click(sheet().getByRole("button", { name: /^Done$/ })); // rail's own Done re-arms for attack 2
    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    await user.click(sheet().getByRole("button", { name: /^Roll damage$/ }));
    await user.click(sheet().getByRole("button", { name: /^Done$/ })); // rail's own Done — commits attack 2
    // Both spent — the footer's OWN Done (separate from the rail's per-swing
    // one) is what actually closes the sheet and fires finishAttack().
    await user.click(sheet().getByRole("button", { name: /^Done$/ }));

    expect(screen.getByText("Turn summary")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByText("Turn summary")).not.toBeInTheDocument();

    // Dismiss is durable against undo (#812): popping the last recordAttack
    // restores the economy but must not resurrect stale banner rows.
    await user.click(screen.getByRole("button", { name: /Undo/ }));
    expect(screen.queryByText("Turn summary")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  // Pre-#1832 this exercised the banner's OWN "hit or miss?" inline-resolve
  // affordance for a row left unresolved via AttackStepCard's "Skip" link.
  // ResolutionRail (#1831) has no such escape hatch — every swing settles a
  // verdict (implicit hit, called miss, or a die-forced crit/miss) before
  // "Done" ever advances — so a row reaching the banner unresolved is no
  // longer reachable from the Attack sheet. What's left to cover here: the
  // banner renders both RESOLVED lines correctly, and the still-reachable
  // "Change verdict" mistaken-verdict recovery keeps working off a resolved row.
  it("Turn-summary banner renders resolved hit/miss lines and still offers Change verdict recovery", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 face 11 → 11+6 = 17 to hit; d8 face 5
    const user = userEvent.setup();
    renderHub(extraAttackFighter());
    await openAttackPicker(user);
    const sheet = () => within(screen.getByRole("dialog"));

    // Swing 1: implicit hit via a damage roll (d8 face 5 + modifier 3 = 8).
    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    await user.click(sheet().getByRole("button", { name: /^Roll damage$/ }));
    await user.click(sheet().getByRole("button", { name: /^Done$/ })); // rail's own Done re-arms for attack 2

    // Swing 2: called miss.
    await user.click(sheet().getByRole("button", { name: /Roll to hit/ }));
    await user.click(sheet().getByRole("button", { name: /it Missed/ }));
    await user.click(sheet().getByRole("button", { name: /^Done$/ })); // rail's own Done — commits attack 2
    // Both spent — the footer's own Done closes the sheet + fires finishAttack().
    await user.click(sheet().getByRole("button", { name: /^Done$/ }));

    expect(screen.getByText(/17 — 8 damage/)).toBeInTheDocument();
    expect(screen.getByText(/miss \(to-hit 17\)/)).toBeInTheDocument();
    expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2);

    // Mistaken-verdict recovery: tapping a resolved line reveals the quiet
    // Change row (take the miss line, rendered last).
    const changeTargets = screen.getAllByRole("button", { name: /Change verdict — / });
    await user.click(changeTargets[changeTargets.length - 1]);
    expect(screen.getByText(/Change ·/)).toBeInTheDocument();
    vi.restoreAllMocks();
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

describe("TurnHub — mobile turn bar (#1028)", () => {
  it("shows the round + derived Speed in the turn-bar subtitle, with a pinned End turn", async () => {
    const user = userEvent.setup();
    renderHub(makeCharacter({ speed: 30 } as unknown as Partial<Character>));
    await startTurn(user);

    expect(screen.getByText(/Round 1 · Move 30 ft/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End turn" })).toBeInTheDocument();
  });

  it("renders the log icon only when a host wires onOpenLog, and opening calls it", async () => {
    const user = userEvent.setup();
    const onOpenLog = vi.fn();
    renderHub(makeCharacter(), onOpenLog);
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Open session log" }));
    expect(onOpenLog).toHaveBeenCalled();
  });

  it("omits the log icon when no host wires onOpenLog", async () => {
    const user = userEvent.setup();
    renderHub();
    await startTurn(user);

    expect(screen.queryByRole("button", { name: "Open session log" })).not.toBeInTheDocument();
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

describe("TurnHub — mid-turn weapon change (#815, interaction-budget model #1165)", () => {
  function weapon(over: Partial<Character["inventory"][number]>): Character["inventory"][number] {
    return {
      category: "weapon",
      quantity: 1,
      equipped: false,
      equippable: true,
      // Served (#1433) — bagItemsForSlot filters on it, so a cast omitting it throws.
      allowedSlots: ["MAIN_HAND", "OFF_HAND"],
      proficient: true,
      weapon: { twoHanded: false, damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing" },
      ...over,
    } as unknown as Character["inventory"][number];
  }

  it("keeps the Action menu reachable in free-only mode after the Action is spent (0 actions)", async () => {
    const user = userEvent.setup();
    const dagger = weapon({ id: "dg", name: "Dagger" }); // bag, both hands empty
    renderHub(makeCharacter({ inventory: [dagger] }));
    await startTurn(user);

    // Spend the Action — no standalone strip exists any more (#1165); the
    // slot button itself must stay tappable to reach the free interaction,
    // but must stop announcing "Use Action" once there's no action to use
    // (a11y — a screen-reader user shouldn't hear an offer that isn't real).
    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Dodge" }));
    expect(screen.queryByRole("button", { name: "Use Action" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interaction options" })).toBeInTheDocument();

    // Reopen — the menu opens in free-only mode, Change weapons is still the
    // way in, and the turn's free interaction still covers a bare draw.
    await user.click(screen.getByRole("button", { name: "Interaction options" }));
    await user.click(screen.getByRole("button", { name: "Change weapons" }));
    const sheet = within(screen.getByRole("dialog"));
    const main = sheet.getByText(/^Main hand/).closest('[data-testid="hand-card"]') as HTMLElement;
    await user.click(within(main).getByRole("button", { name: "Equip" })); // expand
    await user.click(within(within(main).getByRole("list")).getByRole("button", { name: "Equip" }));

    await waitFor(() =>
      expect(applyInventoryTransactions).toHaveBeenCalledWith("char-1", [
        { type: "equip", inventoryItemId: "dg", slot: "MAIN_HAND" },
      ]),
    );
  });

  it("clears the Refund affordance at end of turn (no cross-turn economy leak)", async () => {
    const user = userEvent.setup();
    const longsword = weapon({ id: "ls", name: "Longsword", equipped: true, equippedSlot: "MAIN_HAND" });
    const dagger = weapon({ id: "dg", name: "Dagger" });
    renderHub(makeCharacter({ inventory: [longsword, dagger] }));
    await startTurn(user);

    // Commit an Action-costing swap → Refund surfaces.
    await user.click(screen.getByRole("button", { name: /Use Action/ }));
    await user.click(screen.getByRole("button", { name: "Change weapons" }));
    const sheet = within(screen.getByRole("dialog"));
    const main = sheet.getByText(/^Main hand/).closest('[data-testid="hand-card"]') as HTMLElement;
    await user.click(within(main).getByRole("button", { name: "Change" })); // expand
    await user.click(within(main).getByRole("button", { name: "Swap in" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Refund/ }).length).toBeGreaterThan(0));

    // End the turn and start the next one — the Refund must not carry over.
    await user.click(screen.getByRole("button", { name: "End turn" }));
    await user.click(screen.getByRole("button", { name: "Start my turn" }));
    expect(screen.queryByRole("button", { name: /Refund/ })).not.toBeInTheDocument();
  });
});

describe("TurnHub — Warrior of Shadow reminder actions (2024 rewrite, #1246)", () => {
  function shadowMonk(): Character {
    return makeCharacter({
      class: "Monk",
      subclass: "Warrior of Shadow",
      level: 17,
      availableActions: [
        {
          key: "shadowStep",
          name: "Shadow Step",
          cost: "bonusAction",
          enabled: true,
          reminder: "Teleport up to 60 ft between areas of dim light or darkness (or, for 1 focus, ignore the dim/dark destination requirement); advantage on your first melee attack before the end of this turn. Make one unarmed strike immediately after teleporting.",
        },
      ],
    } as unknown as Partial<Character>);
  }

  it("Shadow Step shows its reminder in the Bonus sheet and on use, and spends no server effect", async () => {
    const user = userEvent.setup();
    renderHub(shadowMonk());
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Bonus" }));
    // Reminder is surfaced as the card caption.
    expect(screen.getByText(/Teleport up to 60 ft/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Shadow Step" }));
    // Bonus consumed + reminder surfaced on use; no backend effect fires.
    expect(screen.queryByRole("button", { name: "Use Bonus" })).not.toBeInTheDocument();
    expect(screen.getByText(/Teleport up to 60 ft/i)).toBeInTheDocument();
    expect(applyActionTransactions).not.toHaveBeenCalled();
  });
});

describe("TurnHub — Bonus Unarmed Strike (Martial Arts, #1218)", () => {
  function monkWithBonusUnarmedStrike(
    actionOverrides: Partial<NonNullable<Character["availableActions"]>[number]> = {},
  ): Character {
    return makeCharacter({
      class: "Monk",
      level: 1,
      availableActions: [
        {
          key: "bonusUnarmedStrike",
          name: "Bonus Unarmed Strike",
          cost: "bonusAction",
          enabled: true,
          ...actionOverrides,
        },
      ],
    } as unknown as Partial<Character>);
  }

  it("offers the card with its rule-text subtitle, no resource badge", async () => {
    const user = userEvent.setup();
    renderHub(monkWithBonusUnarmedStrike());
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Bonus" }));
    expect(
      screen.getByText("One Unarmed Strike as a Bonus Action (Dex + Martial Arts die)."),
    ).toBeInTheDocument();
  });

  it("resolves one Unarmed Strike (no weapon toggle), marks the bonus action used, and fires no server effect", async () => {
    const user = userEvent.setup();
    renderHub(monkWithBonusUnarmedStrike());
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Bonus" }));
    await user.click(screen.getByRole("button", { name: "Bonus Unarmed Strike" }));

    // The resolution sheet opened for the unarmed profile — single form, no toggle.
    expect(screen.getByText("Martial Arts · bonus action")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(applyActionTransactions).not.toHaveBeenCalled();

    // The shared resolver (#1845) requires the swing fully resolved — hit
    // and damaged, or missed — before "Done" appears (no mid-swing "Skip"
    // affordance, matching the main Attack sheet's own #1832 shape).
    await user.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await user.click(screen.getByRole("button", { name: /^Done$/ }));

    // Bonus action is spent; exclusivity blocks re-opening the menu.
    expect(screen.queryByRole("button", { name: "Use Bonus" })).not.toBeInTheDocument();
  });

  it("is disabled with 'Requires no armor or Shield' when the backend gate fails", async () => {
    const user = userEvent.setup();
    renderHub(
      monkWithBonusUnarmedStrike({ enabled: false, disabledReason: "Requires no armor or Shield" }),
    );
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Bonus" }));
    const card = screen.getByRole("button", { name: /Bonus Unarmed Strike/ });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("title", "Requires no armor or Shield");
  });
});

describe("TurnHub — Deflect Attacks reaction (#1241)", () => {
  function deflectMonk(overrides: Partial<Character> = {}): Character {
    return makeCharacter({
      class: "Monk",
      subclass: undefined,
      level: 5,
      abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
      unarmedStrike: {
        attackBonus: 6,
        damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" },
      },
      // The served row has to agree with unarmedStrike above: the row feeds the
      // attack label, unarmedStrike the damage display.
      attackRows: [
        { ...UNARMED_ROW, attackSpec: { count: 1, faces: 20, modifier: 6 }, damageSpec: { count: 1, faces: 8, modifier: 3 } },
        IMPROVISED_ROW,
      ],
      availableActions: [
        {
          key: "deflectAttacks",
          name: "Deflect Attacks",
          cost: "reaction",
          enabled: true,
          reminder:
            "Reaction: when hit by a melee or ranged attack dealing bludgeoning, piercing, or slashing damage (any damage type at L13, Deflect Energy), reduce the damage by 1d10 + Dex modifier + monk level.",
          // Server-resolved (#1505) — below L13 by default; the L13 test below
          // overrides this to "any damage type" itself, the same way the real
          // backend would, instead of the client re-deriving the threshold.
          damageTypeClause: "bludgeoning, piercing, or slashing damage",
          // Reduction spec resolved server-side (#1435): Dex +3 + monk level 5 = 8.
          effect: { effectType: "utility", dice: { count: 1, faces: 10, modifier: 8 }, scaling: { mode: "none" } },
        },
        {
          key: "deflectAttacksRedirect",
          name: "Deflect Attacks — Redirect",
          cost: "free",
          enabled: true,
          resourceKey: "focus",
          effect: { effectType: "damage", dice: { count: 2, faces: 8, modifier: 3 }, scaling: { mode: "none" } },
        },
      ],
      resources: {
        features: [],
        pools: [{ key: "focus", label: "Focus Points", total: 5, recharge: "short-or-long", used: 0, remaining: 5 }],
        maneuversKnown: [],
        toolProficienciesKnown: [],
      },
      ...overrides,
    } as unknown as Partial<Character>);
  }

  it("rolls the reduction on click, shows the toast, and consumes the reaction (no server call)", async () => {
    const user = userEvent.setup();
    renderHub(deflectMonk());
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Reaction" }));
    expect(screen.getByText(/1d10 \+ Dex modifier \+ monk level/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deflect Attacks" }));

    expect(screen.queryByRole("button", { name: "Use Reaction" })).not.toBeInTheDocument();
    expect(screen.getByText(/Deflect Attacks — reduce bludgeoning, piercing, or slashing damage/)).toBeInTheDocument();
    expect(applyActionTransactions).not.toHaveBeenCalled();
  });

  it("offers the redirect option after the base roll, and spends 1 Focus on click", async () => {
    const user = userEvent.setup();
    renderHub(deflectMonk());
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Reaction" }));
    await user.click(screen.getByRole("button", { name: "Deflect Attacks" }));

    const redirectButton = await screen.findByRole("button", { name: /Redirect/ });
    await user.click(redirectButton);

    await waitFor(() =>
      expect(applyActionTransactions).toHaveBeenCalledWith("char-1", [
        { type: "executeAction", actionKey: "deflectAttacksRedirect" },
      ]),
    );
    expect(await screen.findByText(/Dexterity sav/i)).toBeInTheDocument();
    // The redirect is one-shot per reaction — the button doesn't linger.
    expect(screen.queryByRole("button", { name: /Redirect/ })).not.toBeInTheDocument();
  });

  it("does not offer the redirect option when no Focus remains", async () => {
    const user = userEvent.setup();
    renderHub(
      deflectMonk({
        availableActions: [
          {
            key: "deflectAttacks",
            name: "Deflect Attacks",
            cost: "reaction",
            enabled: true,
            effect: { effectType: "utility", dice: { count: 1, faces: 10, modifier: 8 }, scaling: { mode: "none" } },
          },
          { key: "deflectAttacksRedirect", name: "Deflect Attacks — Redirect", cost: "free", enabled: false, disabledReason: "No focus remaining" },
        ],
        resources: {
          features: [],
          pools: [{ key: "focus", label: "Focus Points", total: 5, recharge: "short-or-long", used: 5, remaining: 0 }],
          maneuversKnown: [],
          toolProficienciesKnown: [],
        },
      } as unknown as Partial<Character>),
    );
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Reaction" }));
    await user.click(screen.getByRole("button", { name: "Deflect Attacks" }));

    expect(screen.queryByRole("button", { name: /Redirect/ })).not.toBeInTheDocument();
  });

  it("names 'any damage type' at monk L13 (Deflect Energy) — served, never re-derived from the level", async () => {
    const user = userEvent.setup();
    renderHub(
      deflectMonk({
        level: 13,
        availableActions: [
          {
            key: "deflectAttacks",
            name: "Deflect Attacks",
            cost: "reaction",
            enabled: true,
            damageTypeClause: "any damage type",
            // Dex +3 + monk level 13 = 16.
            effect: { effectType: "utility", dice: { count: 1, faces: 10, modifier: 16 }, scaling: { mode: "none" } },
          },
          {
            key: "deflectAttacksRedirect",
            name: "Deflect Attacks — Redirect",
            cost: "free",
            enabled: true,
            resourceKey: "focus",
            effect: { effectType: "damage", dice: { count: 2, faces: 10, modifier: 3 }, scaling: { mode: "none" } },
          },
        ],
      } as unknown as Partial<Character>),
    );
    await startTurn(user);

    await user.click(screen.getByRole("button", { name: "Use Reaction" }));
    await user.click(screen.getByRole("button", { name: "Deflect Attacks" }));

    expect(screen.getByText(/Deflect Attacks — reduce any damage type/)).toBeInTheDocument();
  });
});

// #1430: the universal cards are served per edition now, not held client-side.
// These are the surfaces where the 2014/2024 divergence is actually visible.
describe("TurnHub — universal actions come from GET /api/reference (#1430)", () => {
  const openActionSheet = async (character: Character) => {
    const user = userEvent.setup();
    renderHub(character);
    await startTurn(user);
    await user.click(screen.getByRole("button", { name: "Use Action" }));
    return user;
  };

  // slotView takes ["Attack", …class actions, …served action-cost rows except
  // attack].slice(0, 4). With no class actions that is Attack plus the first
  // three served names — and because the route sorts by name AFTER resolution,
  // the 2024 rename moves "Magic" out of the window entirely while 2014's "Cast
  // a Spell" sits inside it. That asymmetry IS the rename reaching the UI.
  it("the collapsed Action-slot preview uses the SERVED names and order — 2024 has no Cast a Spell", async () => {
    const user = userEvent.setup();
    renderHub(makeCharacter({ availableActions: [] } as unknown as Partial<Character>));
    await startTurn(user);
    expect(screen.getByText("Attack · Dash · Disengage · Dodge")).toBeInTheDocument();
    expect(screen.queryByText(/Cast a Spell/)).toBeNull();
  });

  it("the 2014 preview still reads Cast a Spell", async () => {
    const user = userEvent.setup();
    renderHub(
      makeCharacter({ rulesEdition: "EDITION_2014", availableActions: [] } as unknown as Partial<Character>),
    );
    await startTurn(user);
    expect(screen.getByText("Attack · Cast a Spell · Dash · Disengage")).toBeInTheDocument();
  });

  it("2024 gains the Study and Influence tiles; the hardcoded primary cards are unchanged", async () => {
    const user = await openActionSheet(makeCharacter());
    await user.click(screen.getByRole("button", { name: /More actions/ }));

    expect(screen.getByRole("button", { name: "Study" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Influence" })).toBeInTheDocument();
    // Primary titles are literals in ActionSheetBody, so the renames never reach them.
    expect(screen.getByRole("button", { name: "Use an item" })).toBeInTheDocument();
  });

  it("2014 gains neither", async () => {
    const user = await openActionSheet(makeCharacter({ rulesEdition: "EDITION_2014" } as unknown as Partial<Character>));
    await user.click(screen.getByRole("button", { name: /More actions/ }));

    expect(screen.queryByRole("button", { name: "Study" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Influence" })).toBeNull();
    expect(screen.getByRole("button", { name: "Grapple" })).toBeInTheDocument();
  });

  // The reaction sheet's card set is the same in both editions — only the
  // spell-card's name forks, since SRD 5.2 has no "Cast a Spell" action.
  it("serves the reaction cards for both editions", async () => {
    const user = userEvent.setup();
    // opportunityAttack is a class action on the default fixture, so the
    // universal OA row is filtered out; drop it to see the served one.
    renderHub(makeCharacter({ availableActions: [], spellcasting: { spells: [] } } as unknown as Partial<Character>));
    await startTurn(user);
    await user.click(screen.getByRole("button", { name: "Use Reaction" }));

    expect(screen.getByRole("button", { name: "Opportunity Attack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cast a Reaction Spell" })).toBeInTheDocument();
  });
});
