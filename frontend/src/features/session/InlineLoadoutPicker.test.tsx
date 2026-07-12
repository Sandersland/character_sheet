import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineLoadoutPicker from "@/features/session/InlineLoadoutPicker";
import { useLoadoutSwap } from "@/features/session/useLoadoutSwap";
import { applyInventoryTransactions } from "@/api/client";
import type { Character, InventoryItem } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

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

function makeTurnState(actionsRemaining: number): TurnState & TurnStateActions {
  return {
    actionsRemaining,
    consumeAction: vi.fn(),
    refundAction: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

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

/** Scope queries to one hand's card ("Main hand" / "Off hand"). */
function handCard(heading: string) {
  const label = screen.getByText(new RegExp(`^${heading}`));
  return within(label.closest('[data-testid="hand-card"]') as HTMLElement);
}

describe("InlineLoadoutPicker (#815)", () => {
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

  it("swapping into the occupied main hand spends the Action and posts the swap batch", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
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
    expect(onUpdate).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Refund/ })).toBeInTheDocument());
  });

  it("at 0 actions with both hands occupied: both hands disabled with a reason, no swap reachable", async () => {
    renderPicker(makeChar([longsword, shield, dagger]), makeTurnState(0));
    // Both hand toggles disabled with the text reason — a held swap needs the Action.
    expect(handCard("Main hand").getByRole("button", { name: "Change" })).toBeDisabled();
    expect(handCard("Off hand").getByRole("button", { name: "Change" })).toBeDisabled();
    expect(screen.getAllByText(/No action left/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Swap in" })).not.toBeInTheDocument();
  });

  it("at 0 actions with one hand free: occupied hand disabled, free hand draws for free", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(0);
    // Longsword in main, off hand empty, a bag dagger that fits the off hand.
    renderPicker(makeChar([longsword, dagger]), turnState);

    const main = handCard("Main hand");
    expect(main.getByRole("button", { name: "Change" })).toBeDisabled();
    expect(main.getByText(/No action left — swapping a held item costs your Action/)).toBeInTheDocument();

    // Free off-hand Equip works: draws the dagger for free.
    const off = handCard("Off hand");
    await user.click(off.getByRole("button", { name: "Equip" })); // expand off hand
    await user.click(within(off.getByRole("list")).getByRole("button", { name: "Equip" })); // the dagger option
    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [{ type: "equip", inventoryItemId: "dg", slot: "OFF_HAND" }]),
    );
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("filling an EMPTY hand is free (no Action spent)", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderPicker(makeChar([dagger]), turnState); // both hands empty

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Equip" })); // expand main hand
    await user.click(within(main.getByRole("list")).getByRole("button", { name: "Equip" })); // the dagger option

    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [{ type: "equip", inventoryItemId: "dg", slot: "MAIN_HAND" }]),
    );
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("swapping in a two-handed weapon stows BOTH hands", async () => {
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

  it("Stow empties the hand for free", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderPicker(makeChar([longsword]), turnState);

    const main = handCard("Main hand");
    await user.click(main.getByRole("button", { name: "Change" })); // expand main hand
    await user.click(main.getByRole("button", { name: "Stow" }));

    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [{ type: "setEquipped", inventoryItemId: "ls", equipped: false }]),
    );
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("refund reverses the swap and returns the Action", async () => {
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
  });
});
