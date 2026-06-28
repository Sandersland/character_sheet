import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InventoryRow from "@/features/inventory/InventoryRow";
import type { InventoryItem } from "@/types/character";

const mockItem: InventoryItem = {
  id: "item-1",
  name: "Club",
  category: "weapon",
  quantity: 2,
  equipped: false,
  weapon: {
    damageDiceCount: 1,
    damageDiceFaces: 4,
    damageModifier: 0,
    damageType: "bludgeoning",
    finesse: false,
    light: true,
    heavy: false,
    twoHanded: false,
    reach: false,
    thrown: false,
    ammunition: false,
  },
};

function renderRow(overrides: Partial<Parameters<typeof InventoryRow>[0]> = {}) {
  const props = {
    item: mockItem,
    mode: "view" as const,
    pending: false,
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<ul><InventoryRow {...props} /></ul>), props };
}

describe("InventoryRow (view mode)", () => {
  it("renders the item name", () => {
    renderRow();
    expect(screen.getByText("Club")).toBeInTheDocument();
  });

  it("renders the category badge", () => {
    renderRow();
    expect(screen.getByText("weapon")).toBeInTheDocument();
  });

  it("shows quantity in the details", () => {
    renderRow();
    // quantity=2 → "2x" in the details line
    expect(screen.getByText(/2x/)).toBeInTheDocument();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(props.onEdit).toHaveBeenCalledOnce();
  });

  it("calls onSubmit with a remove operation when Remove is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(props.onSubmit).toHaveBeenCalledWith([
      { type: "remove", inventoryItemId: "item-1" },
    ]);
  });

  it("shows the Equip control for an equippable (weapon) item", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "Equip" })).toBeInTheDocument();
  });

  it("hides the Equip/Unequip control for a non-equippable (gear) item", () => {
    renderRow({ item: { ...mockItem, category: "gear" } });
    expect(screen.queryByRole("button", { name: "Equip" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unequip" })).toBeNull();
  });

  it("shows Equipped badge when item is equipped", () => {
    renderRow({ item: { ...mockItem, equipped: true } });
    expect(screen.getByText("Equipped")).toBeInTheDocument();
  });

  it("disables action buttons when pending", () => {
    renderRow({ pending: true });
    for (const name of ["Edit", "Remove"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });
});
