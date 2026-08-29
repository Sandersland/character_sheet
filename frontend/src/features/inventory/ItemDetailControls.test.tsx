import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ItemDetailControls from "@/features/inventory/ItemDetailControls";
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

function renderControls(overrides: Partial<Parameters<typeof ItemDetailControls>[0]> = {}) {
  const props = {
    item: mockItem,
    pending: false,
    atCap: false,
    onSubmit: vi.fn().mockResolvedValue(undefined),
    bond: { eligible: true, atCap: false, pending: false, onSubmit: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
  return { ...render(<ItemDetailControls {...props} />), props };
}

// ItemDetailControls is the mobile detail-sheet twin of InventoryRow's own
// pill cluster — both delegate to the same InventoryRowControls, so this locks
// the mobile path independently of InventoryRow.test.tsx's bag coverage.
describe("ItemDetailControls — Weapon Bond toggle (#1854)", () => {
  it("shows an enabled Bond pill when neither pending flag is set", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "Bond" })).not.toBeDisabled();
  });

  it("disables the Bond pill when bond.pending is true, even while the row's pending is false", () => {
    renderControls({
      pending: false,
      bond: { eligible: true, atCap: false, pending: true, onSubmit: vi.fn().mockResolvedValue(undefined) },
    });
    expect(screen.getByRole("button", { name: "Bond" })).toBeDisabled();
  });

  it("does NOT disable the Bond pill off the row's generic pending flag alone", () => {
    renderControls({
      pending: true,
      bond: { eligible: true, atCap: false, pending: false, onSubmit: vi.fn().mockResolvedValue(undefined) },
    });
    expect(screen.getByRole("button", { name: "Bond" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Equip" })).toBeDisabled();
  });
});
