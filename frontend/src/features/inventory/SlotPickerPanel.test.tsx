import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SlotPickerPanel from "@/features/inventory/SlotPickerPanel";
import { SERVED_RARITIES } from "@/test/rarities";
import type { InventoryItem } from "@/types/character";

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

describe("SlotPickerPanel", () => {
  it("lists candidates and fires onPick with the chosen item", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <SlotPickerPanel
        slotLabel="Equip Head"
        candidates={[item({ id: "hat", name: "Wizard Hat", rarity: "RARE" })]}
        pending={false}
        action="equip"
        rarities={SERVED_RARITIES}
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Rare")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Wizard Hat/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "hat" }));
  });

  // #1437: serve-only labels — nothing paints until the rows resolve, so a cold
  // cache must never leak the raw enum key into the badge.
  it("renders no rarity badge at all while the served rows are unresolved", () => {
    const { container } = render(
      <SlotPickerPanel
        slotLabel="Equip Head"
        candidates={[item({ id: "hat", name: "Wizard Hat", rarity: "VERY_RARE" })]}
        pending={false}
        action="equip"
        rarities={[]}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Wizard Hat/ })).toBeInTheDocument();
    expect(screen.queryByText("VERY_RARE")).toBeNull();
    expect(container.querySelector(".bg-arcane-50")).toBeNull();
  });

  it("shows an empty hint when nothing fits (edge: no candidates)", () => {
    render(
      <SlotPickerPanel
        slotLabel="Equip Head"
        candidates={[]}
        pending={false}
        action="equip"
        rarities={SERVED_RARITIES}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nothing in your bag fits here/)).toBeInTheDocument();
  });

  it("prefixes replace wording in swap mode", () => {
    render(
      <SlotPickerPanel
        slotLabel="Swap Head"
        candidates={[item({ id: "hat", name: "Wizard Hat" })]}
        pending={false}
        action="replace"
        rarities={SERVED_RARITIES}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Equip & replace: Wizard Hat/ })).toBeInTheDocument();
  });
});
