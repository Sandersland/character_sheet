import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EquipmentDoll from "@/features/inventory/EquipmentDoll";
import type { Character, InventoryItem } from "@/types/character";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "i",
    name: "Item",
    category: "gear",
    quantity: 1,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    ...overrides,
  };
}

const weapon = (twoHanded: boolean, o: Partial<InventoryItem> = {}) =>
  item({
    category: "weapon",
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageModifier: 0,
      damageType: "slashing",
      finesse: false,
      light: false,
      heavy: false,
      twoHanded,
      reach: false,
      thrown: false,
      ammunition: false,
    },
    ...o,
  });

const ring = (o: Partial<InventoryItem> = {}) => item({ category: "gear", slot: "RING", ...o });

function makeCharacter(inventory: InventoryItem[]): Character {
  return {
    id: "char-1",
    name: "Aria",
    armorClass: 15,
    inventory,
  } as unknown as Character;
}

function renderDoll(inventory: InventoryItem[], onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<EquipmentDoll character={makeCharacter(inventory)} pending={false} onSubmit={onSubmit} />);
  return { onSubmit };
}

describe("EquipmentDoll slot rendering", () => {
  it("renders empty slots as equip buttons", () => {
    renderDoll([]);
    expect(
      screen.getByRole("button", { name: /Main hand slot, empty/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Body slot, empty/ })).toBeInTheDocument();
  });

  it("renders a filled slot showing the equipped item name", () => {
    renderDoll([weapon(false, { id: "sword", name: "Longsword", equippedSlot: "MAIN_HAND" })]);
    // The occupied slot becomes a Popover trigger, not an empty-slot button.
    expect(screen.getByRole("button", { name: /Main hand: Longsword/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Main hand slot, empty/ })).toBeNull();
  });

  it("locks the off-hand when a two-handed weapon holds the main hand", () => {
    renderDoll([weapon(true, { id: "gs", name: "Greatsword", equippedSlot: "MAIN_HAND" })]);
    expect(screen.getByLabelText("Off hand slot locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Off hand slot, empty/ })).toBeNull();
  });

  it("renders RING as two independent sub-slots", () => {
    renderDoll([ring({ id: "band", name: "Signet Band", equippedSlot: "RING" })]);
    // Ring 1 is filled with the band; Ring 2 is still an empty slot.
    expect(screen.getByRole("button", { name: /Ring 1: Signet Band/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ring 2 slot, empty/ })).toBeInTheDocument();
  });
});

describe("EquipmentDoll inline picker", () => {
  it("opens an inline picker of compatible bag items and equips a pick", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDoll([
      weapon(false, { id: "sword", name: "Longsword" }),
      item({ id: "potion", name: "Potion", category: "consumable" }),
    ]);

    await user.click(screen.getByRole("button", { name: /Main hand slot, empty/ }));

    // The picker lists the compatible weapon but not the consumable.
    expect(screen.getByText("Equip Main hand")).toBeInTheDocument();
    const pick = screen.getByRole("button", { name: /Longsword/ });
    expect(screen.queryByText("Potion")).toBeNull();

    await user.click(pick);
    expect(onSubmit).toHaveBeenCalledWith([
      { type: "equip", inventoryItemId: "sword", slot: "MAIN_HAND" },
    ]);
  });

  it("swap from a filled slot batches an unequip + equip atomically", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDoll([
      weapon(false, { id: "worn", name: "Old Blade", equippedSlot: "MAIN_HAND" }),
      weapon(false, { id: "new", name: "Fine Blade" }),
    ]);

    await user.click(screen.getByRole("button", { name: /Main hand: Old Blade/ }));
    await user.click(screen.getByRole("button", { name: "Swap" }));
    await user.click(screen.getByRole("button", { name: /Equip & replace: Fine Blade/ }));

    expect(onSubmit).toHaveBeenCalledWith([
      { type: "setEquipped", inventoryItemId: "worn", equipped: false },
      { type: "equip", inventoryItemId: "new", slot: "MAIN_HAND" },
    ]);
  });
});
