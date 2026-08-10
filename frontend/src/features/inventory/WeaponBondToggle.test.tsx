import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import WeaponBondToggle from "@/features/inventory/WeaponBondToggle";
import type { InventoryItem } from "@/types/character";

const mockItem: InventoryItem = {
  id: "item-1",
  name: "Longsword",
  category: "weapon",
  quantity: 1,
  equipped: false,
  attuned: false,
  weaponBonded: false,
  requiresAttunement: false,
  equippable: true,
  allowedSlots: ["MAIN_HAND"],
  proficient: true,
};

function renderToggle(overrides: Partial<Parameters<typeof WeaponBondToggle>[0]> = {}) {
  const props = {
    item: mockItem,
    pending: false,
    atCap: false,
    onSubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<WeaponBondToggle {...props} />), props };
}

describe("WeaponBondToggle", () => {
  it("renders an unbonded weapon as a Bond pill and submits bondWeapon on click", () => {
    const { props } = renderToggle();
    const button = screen.getByRole("button", { name: "Bond" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    button.click();
    expect(props.onSubmit).toHaveBeenCalledWith([{ type: "bondWeapon", inventoryItemId: "item-1" }]);
  });

  it("renders a bonded weapon as a Bonded pill and submits unbondWeapon on click", () => {
    const { props } = renderToggle({ item: { ...mockItem, weaponBonded: true } });
    const button = screen.getByRole("button", { name: "Bonded" });
    expect(button).toHaveAttribute("aria-pressed", "true");

    button.click();
    expect(props.onSubmit).toHaveBeenCalledWith([{ type: "unbondWeapon", inventoryItemId: "item-1" }]);
  });

  it("disables and explains the 2-weapon cap when at the cap and not yet bonded", () => {
    renderToggle({ atCap: true });
    const button = screen.getByRole("button", { name: "Bond" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "At Weapon Bond limit (2/2) — unbond one first");
  });

  it("stays enabled at the cap for an already-bonded weapon (unbonding always legal)", () => {
    renderToggle({ atCap: true, item: { ...mockItem, weaponBonded: true } });
    expect(screen.getByRole("button", { name: "Bonded" })).not.toBeDisabled();
  });
});
