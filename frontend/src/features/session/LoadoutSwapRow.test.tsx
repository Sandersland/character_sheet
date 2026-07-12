import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

/** Open the picker sheet via the row-level Change (unique before the sheet opens). */
async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Change" }));
  return within(screen.getByRole("dialog"));
}

/** Scope queries to one hand's card ("Main hand" / "Off hand"). */
function handCard(dialog: ReturnType<typeof within>, heading: string) {
  const label = dialog.getByText(new RegExp(`^${heading}`));
  return within(label.closest(".py-2") as HTMLElement);
}

describe("LoadoutSwapRow (#789)", () => {
  it("shows the current loadout label", () => {
    renderRow(makeChar([longsword, dagger]), makeTurnState(1));
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByText(/Equipped ·/)).toBeInTheDocument();
  });

  it("Change opens per-hand cards; expanding a hand lists its bag candidates", async () => {
    const user = userEvent.setup();
    renderRow(makeChar([longsword, dagger]), makeTurnState(1));
    const dialog = await openSheet(user);
    expect(screen.getByText("Change loadout")).toBeInTheDocument();
    // Main-hand card shows the current weapon; expanding it reveals the Dagger.
    const main = handCard(dialog, "Main hand");
    await user.click(main.getByRole("button", { name: "Change" }));
    expect(main.getAllByText("Dagger").length).toBeGreaterThan(0);
  });

  it("swapping into the occupied main hand spends the Action and posts the swap batch", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    const onUpdate = vi.fn();
    renderRow(makeChar([longsword, dagger]), turnState, onUpdate);

    const dialog = await openSheet(user);
    const main = handCard(dialog, "Main hand");
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

  it("disables the row Change (with a hint) when both hands are occupied at 0 actions", async () => {
    const user = userEvent.setup();
    renderRow(makeChar([longsword, shield, dagger]), makeTurnState(0));

    expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
    expect(screen.getByText(/No action left/)).toBeInTheDocument();
    // The disabled row can't be opened, so no swap affordance renders anywhere.
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Swap in" })).not.toBeInTheDocument();
  });

  it("at 0 actions with one hand free: occupied hand disabled with reason, free hand draws for free", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(0);
    // Longsword in main, off hand empty, a bag dagger that fits the off hand.
    renderRow(makeChar([longsword, dagger]), turnState);

    const dialog = await openSheet(user);
    // Occupied main-hand Change is disabled with a *text* reason (not title-only).
    const main = handCard(dialog, "Main hand");
    expect(main.getByRole("button", { name: "Change" })).toBeDisabled();
    expect(main.getByText(/No action left — swapping a held item costs your Action/)).toBeInTheDocument();

    // Free off-hand Equip works: draws the dagger for free.
    const off = handCard(dialog, "Off hand");
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
    renderRow(makeChar([dagger]), turnState); // both hands empty

    const dialog = await openSheet(user);
    const main = handCard(dialog, "Main hand");
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
    renderRow(makeChar([longsword, offDagger, greataxe]), turnState);

    const dialog = await openSheet(user);
    const main = handCard(dialog, "Main hand");
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
    renderRow(makeChar([longsword, dagger, dagger2]), makeTurnState(1));

    const dialog = await openSheet(user);
    await user.click(dialog.getByRole("button", { name: "Change" })); // expand main hand
    // One Dagger label, one ×2 badge — not two rows.
    expect(dialog.getAllByText("Dagger")).toHaveLength(1);
    expect(dialog.getByText("×2")).toBeInTheDocument();
  });

  it("Stow empties the hand for free", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderRow(makeChar([longsword]), turnState);

    const dialog = await openSheet(user);
    await user.click(dialog.getByRole("button", { name: "Change" })); // expand main hand
    await user.click(dialog.getByRole("button", { name: "Stow" }));

    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("c1", [{ type: "setEquipped", inventoryItemId: "ls", equipped: false }]),
    );
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("refund reverses the swap and returns the Action", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState(1);
    renderRow(makeChar([longsword, dagger]), turnState);

    const dialog = await openSheet(user);
    await user.click(dialog.getByRole("button", { name: "Change" }));
    await user.click(dialog.getByRole("button", { name: "Swap in" }));
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
