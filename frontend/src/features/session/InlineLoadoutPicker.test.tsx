import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineLoadoutPicker from "@/features/session/InlineLoadoutPicker";
import { useLoadoutSwap } from "@/features/session/useLoadoutSwap";
import { applyInventoryTransactions } from "@/api/client";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
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

// bagItemsForSlot reads allowedSlots directly; a fixture omitting it throws rather than degrading.
function weapon(over: Partial<InventoryItem>, twoHanded = false): InventoryItem {
  return {
    category: "weapon",
    quantity: 1,
    equipped: false,
    equippable: true,
    allowedSlots: twoHanded ? ["MAIN_HAND"] : ["MAIN_HAND", "OFF_HAND"],
    proficient: true,
    weapon: { twoHanded, damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing" },
    ...over,
  } as unknown as InventoryItem;
}

const longsword = weapon({ id: "ls", name: "Longsword", equipped: true, equippedSlot: "MAIN_HAND" });
const dagger = weapon({ id: "dg", name: "Dagger" });
const shield = {
  ...weapon({ id: "sh", name: "Shield", equipped: true, equippedSlot: "OFF_HAND" }),
  category: "armor",
  allowedSlots: ["OFF_HAND"],
  armor: { armorCategory: "shield" },
} as unknown as InventoryItem;

function makeChar(inventory: InventoryItem[], over: Partial<Character> = {}): Character {
  return { id: "c1", inventory, offHandLocked: false, ...over } as unknown as Character;
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

const EXHAUSTED_BUDGET = { attackEquipCredits: 0, freeInteractionUsed: true };

function Harness({
  character,
  turnState,
}: {
  character: Character;
  turnState: TurnState & TurnStateActions;
}) {
  const loadout = useLoadoutSwap(character, turnState);
  return <InlineLoadoutPicker turnState={turnState} loadout={loadout} />;
}

function renderPicker(character: Character, turnState: TurnState & TurnStateActions) {
  mockApply.mockResolvedValue(character);
  return renderWithCharacter(<Harness character={character} turnState={turnState} />, character);
}

// The plain vi.fn() stub in makeTurnState never updates state, so a second swap in the same test would never see the first swap's spend.
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

// Reads the character live from the cache so a second interaction sees the hand-occupancy change useLoadoutSwap's first cache write produced.
function LiveHarness({ turnState }: { turnState: TurnState & TurnStateActions }) {
  const { character } = useCurrentCharacter();
  const loadout = useLoadoutSwap(character, turnState);
  return <InlineLoadoutPicker turnState={turnState} loadout={loadout} />;
}

function handCard(heading: string) {
  const label = screen.getByText(new RegExp(`^${heading}`));
  return within(label.closest('[data-testid="hand-card"]') as HTMLElement);
}

describe("InlineLoadoutPicker (#815, interaction-budget model #1165)", () => {
  it("shows the current loadout label and per-hand occupants", () => {
    renderPicker(makeChar([longsword, dagger]), makeTurnState(1));
    expect(screen.getByText(/Now wielding/)).toBeInTheDocument();
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
    const turnState = makeTurnState(1);
    renderPicker(makeChar([longsword, dagger]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" }));
    await user.click(main.getByRole("button", { name: "Swap in" }));

    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    expect(mockApply).toHaveBeenCalledWith("c1", [
      { type: "setEquipped", inventoryItemId: "ls", equipped: false },
      { type: "equip", inventoryItemId: "dg", slot: "MAIN_HAND" },
    ]);
    expect(turnState.consumeAction).toHaveBeenCalledOnce();
    expect(turnState.spendInteractionBudget).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Refund/ })).toBeInTheDocument());
  });

  it("swapping into the occupied main hand is FREE when it rides an attack credit + the free interaction", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1, { attackEquipCredits: 1 });
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
    renderPicker(makeChar([longsword, dagger]), makeTurnState(0));

    const main = handCard("Main hand");
    const toggle = main.getByRole("button", { name: "Change" });
    expect(toggle).toBeEnabled();
    await user.click(toggle);

    const swapRow = within(main.getByRole("list")).getByText("Dagger").closest("li") as HTMLElement;
    expect(within(swapRow).getByRole("button")).toBeDisabled();
    expect(within(swapRow).getByText(/No free interaction or Action left/)).toBeInTheDocument();

    expect(main.getByRole("button", { name: "Stow" })).toBeEnabled();
  });

  it("filling an EMPTY hand is free (paid from the interaction budget, no Action spent)", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderPicker(makeChar([dagger]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Equip" }));
    await user.click(within(main.getByRole("list")).getByRole("button", { name: "Equip" }));

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
    await user.click(main.getByRole("button", { name: "Change" }));
    await user.click(main.getByRole("button", { name: "Swap in" }));

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
    await user.click(main.getByRole("button", { name: "Change" }));
    expect(main.getAllByText("Dagger")).toHaveLength(1);
    expect(main.getByText("×2")).toBeInTheDocument();
  });

  it("Stow is paid from the budget on a fresh turn — no Action spent", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderPicker(makeChar([longsword]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" }));
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
    const turnState = makeTurnState(1);
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
    const turnState = makeTurnState(1, { attackEquipCredits: 1 });
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

    const turnState = makeLiveTurnState(1);
    renderWithCharacter(<LiveHarness turnState={turnState} />, makeChar([ls, dg]));

    await user.click(handCard("Main hand").getByRole("button", { name: "Change" }));
    await user.click(handCard("Main hand").getByRole("button", { name: "Stow" }));
    await waitFor(() =>
      expect(turnState.spendInteractionBudget).toHaveBeenCalledWith({
        fromAttackCredits: 0,
        usedFreeInteraction: true,
      }),
    );
    expect(turnState.freeInteractionUsed).toBe(true);

    // The bag now also offers the just-stowed Longsword, so scope to the Dagger row specifically.
    await user.click(handCard("Main hand").getByRole("button", { name: "Equip" }));
    const daggerRow = within(handCard("Main hand").getByRole("list"))
      .getByText("Dagger")
      .closest("li") as HTMLElement;
    await user.click(within(daggerRow).getByRole("button", { name: "Equip" }));
    await waitFor(() => expect(turnState.consumeAction).toHaveBeenCalledOnce());
    expect(turnState.spendInteractionBudget).toHaveBeenCalledOnce();

    await user.click(await screen.findByRole("button", { name: /Refund/ }));
    await waitFor(() => expect(turnState.refundAction).toHaveBeenCalledOnce());
    expect(turnState.refundInteractionBudget).not.toHaveBeenCalled();
    expect(turnState.freeInteractionUsed).toBe(true);
  });
});
