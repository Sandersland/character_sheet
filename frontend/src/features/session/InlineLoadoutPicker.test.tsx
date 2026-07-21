import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineLoadoutPicker from "@/features/session/InlineLoadoutPicker";
import { useLoadoutSwap } from "@/features/session/useLoadoutSwap";
import { applyInventoryTransactions } from "@/api/client";
import type { Character, InventoryItem } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { InteractionSpend } from "@/lib/loadoutPicker";

vi.mock("@/api/client", () => ({
  applyInventoryTransactions: vi.fn(),
}));
const mockApply = vi.mocked(applyInventoryTransactions);

beforeEach(() => {
  vi.clearAllMocks();
});

function weapon(over: Partial<InventoryItem>, twoHanded = false): InventoryItem {
  return {
    category: "weapon",
    quantity: 1,
    equipped: false,
    weapon: { twoHanded, damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing" },
    ...over,
  } as unknown as InventoryItem;
}

const longsword = weapon({ id: "ls", name: "Longsword", equipped: true, equippedSlot: "MAIN_HAND" });
const dagger = weapon({ id: "dg", name: "Dagger" }); // bag, one-handed
const shield = {
  ...weapon({ id: "sh", name: "Shield", equipped: true, equippedSlot: "OFF_HAND" }),
  category: "armor",
  armor: { armorCategory: "shield" },
} as unknown as InventoryItem;

function makeChar(inventory: InventoryItem[]): Character {
  return { id: "c1", inventory } as unknown as Character;
}

/** budget defaults to a FRESH turn: the once-per-turn free interaction unspent, no attack credits. */
function makeTurnState(
  actionsRemaining: number,
  budget: { attackEquipCredits?: number; freeInteractionUsed?: boolean } = {},
): TurnState & TurnStateActions {
  return {
    actionsRemaining,
    attackEquipCredits: budget.attackEquipCredits ?? 0,
    freeInteractionUsed: budget.freeInteractionUsed ?? false,
    consumeAction: vi.fn(),
    refundAction: vi.fn(),
    spendInteractionBudget: vi.fn(),
    refundInteractionBudget: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

// Fully exhausted: no free interaction, no attack credits, no action.
const EXHAUSTED_BUDGET = { attackEquipCredits: 0, freeInteractionUsed: true };

// Hosts the picker with the real useLoadoutSwap hook — the same swap economy the
// production Action-sheet resolution wires, so the ops/consume/refund assertions
// carry over from the old LoadoutSwapRow test.
function Harness({
  character,
  turnState,
  onUpdate,
}: {
  character: Character;
  turnState: TurnState & TurnStateActions;
  onUpdate: (c: Character) => void;
}) {
  const loadout = useLoadoutSwap(character, turnState, onUpdate);
  return <InlineLoadoutPicker character={character} turnState={turnState} loadout={loadout} />;
}

function renderPicker(character: Character, turnState: TurnState & TurnStateActions, onUpdate = vi.fn()) {
  mockApply.mockResolvedValue(character); // returned char isn't asserted here
  return render(<Harness character={character} turnState={turnState} onUpdate={onUpdate} />);
}

// A turnState whose spend/consume mocks actually mutate the object (mirroring
// the useTurnState reducer) — needed for a two-swap-in-one-test regression:
// the plain vi.fn() stub in makeTurnState never updates, so a second swap in
// the same test would never see the first swap's spend.
function makeLiveTurnState(
  actionsRemaining: number,
  budget: { attackEquipCredits?: number; freeInteractionUsed?: boolean } = {},
): TurnState & TurnStateActions {
  const state = {
    actionsRemaining,
    attackEquipCredits: budget.attackEquipCredits ?? 0,
    freeInteractionUsed: budget.freeInteractionUsed ?? false,
    consumeAction: vi.fn(() => {
      state.actionsRemaining -= 1;
    }),
    refundAction: vi.fn(() => {
      state.actionsRemaining += 1;
    }),
    spendInteractionBudget: vi.fn((spend: InteractionSpend) => {
      state.attackEquipCredits -= spend.fromAttackCredits;
      state.freeInteractionUsed = state.freeInteractionUsed || spend.usedFreeInteraction;
    }),
    refundInteractionBudget: vi.fn((spend: InteractionSpend) => {
      state.attackEquipCredits += spend.fromAttackCredits;
      if (spend.usedFreeInteraction) state.freeInteractionUsed = false;
    }),
  } as unknown as TurnState & TurnStateActions;
  return state;
}

// Re-renders on each swap's onUpdate — needed so a second interaction in the
// same test sees the hand-occupancy change from the first.
function LiveHarness({
  initialCharacter,
  turnState,
}: {
  initialCharacter: Character;
  turnState: TurnState & TurnStateActions;
}) {
  const [character, setCharacter] = useState(initialCharacter);
  const loadout = useLoadoutSwap(character, turnState, setCharacter);
  return <InlineLoadoutPicker character={character} turnState={turnState} loadout={loadout} />;
}

/** Scope queries to one hand's card ("Main hand" / "Off hand"). */
function handCard(heading: string) {
  const label = screen.getByText(new RegExp(`^${heading}`));
  return within(label.closest('[data-testid="hand-card"]') as HTMLElement);
}

describe("InlineLoadoutPicker (#815, interaction-budget model #1165)", () => {
  it("shows the current loadout label and per-hand occupants", () => {
    renderPicker(makeChar([longsword, dagger]), makeTurnState(1));
    expect(screen.getByText(/Now wielding/)).toBeInTheDocument();
    // Longsword appears in the summary line + the Main-hand card header.
    expect(screen.getAllByText("Longsword").length).toBeGreaterThan(0);
  });

  it("expanding a hand lists its bag candidates", async () => {
    const user = userEvent.setup();
    renderPicker(makeChar([longsword, dagger]), makeTurnState(1));
    const main = handCard("Main hand");
    const toggle = main.getByRole("button", { name: "Change" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(main.getAllByText("Dagger").length).toBeGreaterThan(0);
  });

  it("swapping into the occupied main hand costs the Action when the budget can't cover 2 units", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1); // fresh budget: only 1 unit (the free interaction)
    const onUpdate = vi.fn();
    renderPicker(makeChar([longsword, dagger]), turnState, onUpdate);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" })); // expand main hand
    await user.click(main.getByRole("button", { name: "Swap in" }));

    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    expect(mockApply).toHaveBeenCalledWith("c1", [
      { type: "setEquipped", inventoryItemId: "ls", equipped: false },
      { type: "equip", inventoryItemId: "dg", slot: "MAIN_HAND" },
    ]);
    expect(turnState.consumeAction).toHaveBeenCalledOnce();
    expect(turnState.spendInteractionBudget).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Refund/ })).toBeInTheDocument());
  });

  it("swapping into the occupied main hand is FREE when it rides an attack credit + the free interaction", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1, { attackEquipCredits: 1 }); // 1 attack made this turn
    renderPicker(makeChar([longsword, dagger]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" }));
    await user.click(main.getByRole("button", { name: "Swap in" }));

    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    expect(turnState.spendInteractionBudget).toHaveBeenCalledWith({
      fromAttackCredits: 1,
      usedFreeInteraction: true,
    });
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("fully exhausted budget + 0 actions: both hand toggles are blocked, no swap reachable", async () => {
    renderPicker(makeChar([longsword, shield, dagger]), makeTurnState(0, EXHAUSTED_BUDGET));
    expect(handCard("Main hand").getByRole("button", { name: "Change" })).toBeDisabled();
    expect(handCard("Off hand").getByRole("button", { name: "Change" })).toBeDisabled();
    expect(screen.getAllByText(/No free interaction or Action left/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Swap in" })).not.toBeInTheDocument();
  });

  it("0 actions with a fresh budget: the occupied hand toggle stays reachable — Stow is free, a full swap is blocked", async () => {
    const user = userEvent.setup();
    renderPicker(makeChar([longsword, dagger]), makeTurnState(0)); // fresh budget: 1 unit left

    const main = handCard("Main hand");
    const toggle = main.getByRole("button", { name: "Change" });
    expect(toggle).toBeEnabled(); // 1 unit still covers the cheapest interaction (Stow)
    await user.click(toggle);

    // The dagger swap needs 2 units (stow + draw) — budget only has 1 → blocked.
    const swapRow = within(main.getByRole("list")).getByText("Dagger").closest("li") as HTMLElement;
    expect(within(swapRow).getByRole("button")).toBeDisabled();
    expect(within(swapRow).getByText(/No free interaction or Action left/)).toBeInTheDocument();

    // Stow only needs 1 unit — still free and clickable.
    expect(main.getByRole("button", { name: "Stow" })).toBeEnabled();
  });

  it("filling an EMPTY hand is free (paid from the interaction budget, no Action spent)", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1); // fresh budget
    renderPicker(makeChar([dagger]), turnState); // both hands empty

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Equip" })); // expand main hand
    await user.click(within(main.getByRole("list")).getByRole("button", { name: "Equip" })); // the dagger option

    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [{ type: "equip", inventoryItemId: "dg", slot: "MAIN_HAND" }]),
    );
    expect(turnState.spendInteractionBudget).toHaveBeenCalledWith({
      fromAttackCredits: 0,
      usedFreeInteraction: true,
    });
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("swapping in a two-handed weapon stows BOTH hands (3 units → costs the Action on a fresh budget)", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    const offDagger = weapon({ id: "off", name: "Dagger", equipped: true, equippedSlot: "OFF_HAND" });
    const greataxe = weapon({ id: "ga", name: "Greataxe" }, true);
    renderPicker(makeChar([longsword, offDagger, greataxe]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" })); // expand main hand
    await user.click(main.getByRole("button", { name: "Swap in" })); // Greataxe

    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [
        { type: "setEquipped", inventoryItemId: "ls", equipped: false },
        { type: "setEquipped", inventoryItemId: "off", equipped: false },
        { type: "equip", inventoryItemId: "ga", slot: "MAIN_HAND" },
      ]),
    );
    expect(turnState.consumeAction).toHaveBeenCalledOnce();
  });

  it("dedupes duplicate weapons into one row with a ×N badge", async () => {
    const user = userEvent.setup();
    const dagger2 = weapon({ id: "dg2", name: "Dagger" });
    renderPicker(makeChar([longsword, dagger, dagger2]), makeTurnState(1));

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" })); // expand main hand
    expect(main.getAllByText("Dagger")).toHaveLength(1);
    expect(main.getByText("×2")).toBeInTheDocument();
  });

  it("Stow is paid from the budget on a fresh turn — no Action spent", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderPicker(makeChar([longsword]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" })); // expand main hand
    await user.click(main.getByRole("button", { name: "Stow" }));

    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [{ type: "setEquipped", inventoryItemId: "ls", equipped: false }]),
    );
    expect(turnState.spendInteractionBudget).toHaveBeenCalledWith({
      fromAttackCredits: 0,
      usedFreeInteraction: true,
    });
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("refund reverses an Action-paid swap and returns the Action", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1); // fresh budget → occupied swap costs the Action
    renderPicker(makeChar([longsword, dagger]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" }));
    await user.click(main.getByRole("button", { name: "Swap in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Refund/ })).toBeInTheDocument());

    mockApply.mockClear();
    await user.click(screen.getByRole("button", { name: /Refund/ }));

    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [
        { type: "setEquipped", inventoryItemId: "dg", equipped: false },
        { type: "equip", inventoryItemId: "ls", slot: "MAIN_HAND" },
      ]),
    );
    expect(turnState.refundAction).toHaveBeenCalledOnce();
    expect(turnState.refundInteractionBudget).not.toHaveBeenCalled();
  });

  it("refund reverses a budget-paid swap and returns the interaction budget", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1, { attackEquipCredits: 1 }); // rides the attack credit + free interaction
    renderPicker(makeChar([longsword, dagger]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" }));
    await user.click(main.getByRole("button", { name: "Swap in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Refund/ })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Refund/ }));

    await waitFor(() =>
      expect(turnState.refundInteractionBudget).toHaveBeenCalledWith({
        fromAttackCredits: 1,
        usedFreeInteraction: true,
      }),
    );
    expect(turnState.refundAction).not.toHaveBeenCalled();
  });

  it("a second swap after the free interaction is spent falls back to the Action, and refund restores exactly what it paid (review regression)", async () => {
    const user = userEvent.setup();
    const ls = weapon({ id: "ls", name: "Longsword", equipped: true, equippedSlot: "MAIN_HAND" });
    const dg = weapon({ id: "dg", name: "Dagger" });
    const afterStow = makeChar([{ ...ls, equipped: false, equippedSlot: undefined }, dg]);
    mockApply.mockResolvedValue(afterStow);

    const turnState = makeLiveTurnState(1); // fresh: 1 action, the free interaction unspent, no attack credits
    render(<LiveHarness initialCharacter={makeChar([ls, dg])} turnState={turnState} />);

    // First: Stow the main hand (1 unit) — paid from the free interaction.
    await user.click(handCard("Main hand").getByRole("button", { name: "Change" }));
    await user.click(handCard("Main hand").getByRole("button", { name: "Stow" }));
    await waitFor(() =>
      expect(turnState.spendInteractionBudget).toHaveBeenCalledWith({
        fromAttackCredits: 0,
        usedFreeInteraction: true,
      }),
    );
    expect(turnState.freeInteractionUsed).toBe(true);

    // Second: draw the dagger into the now-empty main hand (1 unit) — the
    // free interaction is spent and no attack credits were earned, so this
    // falls back to the Action rather than blocking. The bag now also offers
    // the just-stowed Longsword, so scope to the Dagger row specifically.
    await user.click(handCard("Main hand").getByRole("button", { name: "Equip" }));
    const daggerRow = within(handCard("Main hand").getByRole("list"))
      .getByText("Dagger")
      .closest("li") as HTMLElement;
    await user.click(within(daggerRow).getByRole("button", { name: "Equip" }));
    await waitFor(() => expect(turnState.consumeAction).toHaveBeenCalledOnce());
    expect(turnState.spendInteractionBudget).toHaveBeenCalledOnce(); // only the FIRST swap used it

    // Refund reverses the SECOND (Action-paid) swap, not the first.
    await user.click(await screen.findByRole("button", { name: /Refund/ }));
    await waitFor(() => expect(turnState.refundAction).toHaveBeenCalledOnce());
    expect(turnState.refundInteractionBudget).not.toHaveBeenCalled();
    // The first spend is irrecoverable — the free interaction stays spent.
    expect(turnState.freeInteractionUsed).toBe(true);
  });
});
