import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LoadoutSwapRow from "@/features/session/LoadoutSwapRow";
import { applyInventoryTransactions } from "@/api/client";
import type { Character, InventoryItem } from "@/types/character";
import type { TurnStateView } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  applyInventoryTransactions: vi.fn(),
}));
const mockApply = vi.mocked(applyInventoryTransactions);

beforeEach(() => {
  vi.clearAllMocks();
});

function weapon(over: Partial<InventoryItem>, light = false): InventoryItem {
  return {
    category: "weapon",
    quantity: 1,
    equipped: false,
    weapon: { twoHanded: false, light, damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing" },
    ...over,
  } as unknown as InventoryItem;
}

const longsword = weapon({ id: "ls", name: "Longsword", equipped: true, equippedSlot: "MAIN_HAND" });
const dagger = weapon({ id: "dg", name: "Dagger" }, true); // bag, light

function makeChar(inventory: InventoryItem[]): Character {
  return { id: "c1", inventory } as unknown as Character;
}

function makeTurnState(actionsRemaining: number): TurnStateView {
  return {
    actionsRemaining,
    consumeAction: vi.fn(),
    refundAction: vi.fn(),
  } as unknown as TurnStateView;
}

function renderRow(character: Character, turnState: TurnStateView, onUpdate = vi.fn()) {
  mockApply.mockResolvedValue(character); // returned char isn't asserted here
  return render(<LoadoutSwapRow character={character} turnState={turnState} onUpdate={onUpdate} />);
}

describe("LoadoutSwapRow (#733)", () => {
  it("shows the current loadout label", () => {
    renderRow(makeChar([longsword, dagger]), makeTurnState(1));
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByText(/Equipped ·/)).toBeInTheDocument();
  });

  it("Change opens a picker listing bag candidates per hand", async () => {
    const user = userEvent.setup();
    renderRow(makeChar([longsword, dagger]), makeTurnState(1));
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText("Change loadout")).toBeInTheDocument();
    // Dagger (bag, one-handed) is offered as a candidate.
    expect(screen.getAllByText("Dagger").length).toBeGreaterThan(0);
  });

  it("swapping into the occupied main hand spends the Action and posts the swap batch", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    const onUpdate = vi.fn();
    renderRow(makeChar([longsword, dagger]), turnState, onUpdate);

    await user.click(screen.getByRole("button", { name: "Change" }));
    // Under "Main hand · Longsword", swap the Dagger in.
    await user.click(screen.getAllByRole("button", { name: "Swap in" })[0]);

    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    expect(mockApply).toHaveBeenCalledWith("c1", [
      { type: "setEquipped", inventoryItemId: "ls", equipped: false },
      { type: "equip", inventoryItemId: "dg", slot: "MAIN_HAND" },
    ]);
    expect(turnState.consumeAction).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalled();
    // A committed swap surfaces the Refund affordance.
    await waitFor(() => expect(screen.getByRole("button", { name: /Refund/ })).toBeInTheDocument());
  });

  it("blocks a swap at 0 actions and does not post anything", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(0);
    renderRow(makeChar([longsword, dagger]), turnState);

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getAllByRole("button", { name: "Swap in" })[0]);

    expect(mockApply).not.toHaveBeenCalled();
    expect(turnState.consumeAction).not.toHaveBeenCalled();
    expect(screen.getByText(/No actions left/)).toBeInTheDocument();
  });

  it("filling an EMPTY hand is free (no Action spent)", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    // Only a bag dagger, both hands empty.
    renderRow(makeChar([dagger]), turnState);

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getAllByRole("button", { name: "Equip" })[0]);

    await waitFor(() => expect(mockApply).toHaveBeenCalledWith("c1", [
      { type: "equip", inventoryItemId: "dg", slot: "MAIN_HAND" },
    ]));
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("swapping in a two-handed weapon stows BOTH hands", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    const offDagger = weapon({ id: "off", name: "Dagger", equipped: true, equippedSlot: "OFF_HAND" }, true);
    const greataxe = { ...weapon({ id: "ga", name: "Greataxe" }), weapon: { twoHanded: true } } as unknown as InventoryItem;
    renderRow(makeChar([longsword, offDagger, greataxe]), turnState);

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getAllByRole("button", { name: "Swap in" })[0]); // Greataxe → main hand

    await waitFor(() => expect(mockApply).toHaveBeenCalledWith("c1", [
      { type: "setEquipped", inventoryItemId: "ls", equipped: false },
      { type: "setEquipped", inventoryItemId: "off", equipped: false },
      { type: "equip", inventoryItemId: "ga", slot: "MAIN_HAND" },
    ]));
    expect(turnState.consumeAction).toHaveBeenCalledOnce();
  });

  it("refund reverses the swap and returns the Action", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderRow(makeChar([longsword, dagger]), turnState);

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getAllByRole("button", { name: "Swap in" })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: /Refund/ })).toBeInTheDocument());

    mockApply.mockClear();
    await user.click(screen.getByRole("button", { name: /Refund/ }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledWith("c1", [
      { type: "setEquipped", inventoryItemId: "dg", equipped: false },
      { type: "equip", inventoryItemId: "ls", slot: "MAIN_HAND" },
    ]));
    expect(turnState.refundAction).toHaveBeenCalledOnce();
  });
});
