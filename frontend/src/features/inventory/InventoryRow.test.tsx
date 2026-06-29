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

  it("shows quantity in the details", () => {
    renderRow();
    expect(screen.getByText(/2x/)).toBeInTheDocument();
  });

  it("shows an Equip toggle for an equippable (weapon) item", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "Equip" })).toBeInTheDocument();
  });

  it("the toggle reads Equipped when the item is equipped", () => {
    renderRow({ item: { ...mockItem, equipped: true } });
    const toggle = screen.getByRole("button", { name: "Equipped" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the Equip toggle for a non-equippable (gear) item", () => {
    renderRow({ item: { ...mockItem, category: "gear", weapon: undefined } });
    expect(screen.queryByRole("button", { name: "Equip" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Equipped" })).toBeNull();
  });

  it("clicking the Equip toggle submits a setEquipped op", async () => {
    const user = userEvent.setup();
    const { props } = renderRow();
    await user.click(screen.getByRole("button", { name: "Equip" }));
    expect(props.onSubmit).toHaveBeenCalledWith([
      { type: "setEquipped", inventoryItemId: "item-1", equipped: true },
    ]);
  });

  it("opening the kebab and choosing Edit calls onEdit", async () => {
    const user = userEvent.setup();
    const { props } = renderRow();
    await user.click(screen.getByRole("button", { name: "Actions for Club" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(props.onEdit).toHaveBeenCalledOnce();
  });

  it("Remove is a two-step confirm: kebab → Remove → Confirm submits a remove op", async () => {
    const user = userEvent.setup();
    const { props } = renderRow();
    await user.click(screen.getByRole("button", { name: "Actions for Club" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));
    // Nothing removed yet — a confirm step appears first.
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove Club\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(props.onSubmit).toHaveBeenCalledWith([{ type: "remove", inventoryItemId: "item-1" }]);
  });

  it("the Remove confirm can be cancelled without removing", async () => {
    const user = userEvent.setup();
    const { props } = renderRow();
    await user.click(screen.getByRole("button", { name: "Actions for Club" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Remove Club\?/)).toBeNull();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("collapses prose behind an expand toggle", async () => {
    const user = userEvent.setup();
    renderRow({ item: { ...mockItem, description: "A stout wooden club." } });
    expect(screen.queryByText("A stout wooden club.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("A stout wooden club.")).toBeInTheDocument();
  });

  it("shows no expand toggle when the item has no prose", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: "Show details" })).toBeNull();
  });

  it("disables the Equip toggle when pending", () => {
    renderRow({ pending: true });
    expect(screen.getByRole("button", { name: "Equip" })).toBeDisabled();
  });

  it("in select mode shows a checkbox and hides the per-row actions", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderRow({ selectMode: true, selected: false, onToggleSelect });
    const checkbox = screen.getByRole("checkbox", { name: "Select Club" });
    expect(checkbox).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equip" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
    await user.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledOnce();
  });
});
