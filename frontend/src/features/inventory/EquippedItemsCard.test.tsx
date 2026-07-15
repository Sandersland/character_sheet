import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import EquippedItemsCard from "@/features/inventory/EquippedItemsCard";
import type { EquipSlot, InventoryItem } from "@/types/character";

function item(id: string, name: string, equippedSlot?: EquipSlot): InventoryItem {
  return { id, name, category: "gear", quantity: 1, equipped: !!equippedSlot, equippedSlot, attuned: false, requiresAttunement: false } as InventoryItem;
}

describe("EquippedItemsCard", () => {
  it("lists only equipped items with resolved slot labels", () => {
    render(
      <EquippedItemsCard
        inventory={[
          item("1", "Longsword", "MAIN_HAND"),
          item("2", "Shield", "OFF_HAND"),
          item("3", "Torch"),
        ]}
      />
    );
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByText("Main hand")).toBeInTheDocument();
    expect(screen.getByText("Shield")).toBeInTheDocument();
    expect(screen.getByText("Off hand")).toBeInTheDocument();
    expect(screen.queryByText("Torch")).not.toBeInTheDocument();
  });

  it("never renders a raw slot enum", () => {
    render(<EquippedItemsCard inventory={[item("1", "Longsword", "MAIN_HAND")]} />);
    expect(screen.queryByText("MAIN_HAND")).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing is equipped", () => {
    render(<EquippedItemsCard inventory={[item("3", "Torch")]} />);
    expect(screen.getByText("Nothing equipped.")).toBeInTheDocument();
  });
});
