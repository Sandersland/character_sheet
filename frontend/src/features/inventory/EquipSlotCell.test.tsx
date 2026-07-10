import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EquipSlotCell from "@/features/inventory/EquipSlotCell";
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

describe("EquipSlotCell — locked branch", () => {
  it("renders a plain locked tile carrying the lock reason as its title", () => {
    render(
      <EquipSlotCell
        slot="OFF_HAND"
        label="Off hand"
        item={null}
        locked
        lockReason="Reserved"
        candidates={[]}
        pending={false}
        onEquip={vi.fn()}
        onUnequip={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    const tile = screen.getByLabelText("Off hand slot locked");
    expect(tile).toHaveAttribute("title", "Reserved");
    expect(tile.tagName).toBe("DIV");
  });

  it("ghosts a two-handed lock owner and focuses it on click", async () => {
    const user = userEvent.setup();
    const onFocusLockOwner = vi.fn();
    render(
      <EquipSlotCell
        slot="OFF_HAND"
        label="Off hand"
        item={null}
        locked
        lockReason="Held by two-handed Greatsword"
        lockedByItem={item({ id: "gs", name: "Greatsword" })}
        onFocusLockOwner={onFocusLockOwner}
        candidates={[]}
        pending={false}
        onEquip={vi.fn()}
        onUnequip={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    const lock = screen.getByRole("button", {
      name: "Off hand held by two-handed Greatsword — focus it",
    });
    expect(screen.getByText("Two-handed")).toBeInTheDocument();
    await user.click(lock);
    expect(onFocusLockOwner).toHaveBeenCalledTimes(1);
  });
});

describe("EquipSlotCell — filled branch", () => {
  it("renders the equipped item and unequips it", async () => {
    const user = userEvent.setup();
    const onUnequip = vi.fn();
    const equipped = item({ id: "sword", name: "Longsword", category: "weapon" });
    render(
      <EquipSlotCell
        slot="MAIN_HAND"
        label="Main hand"
        item={equipped}
        locked={false}
        candidates={[]}
        pending={false}
        onEquip={vi.fn()}
        onUnequip={onUnequip}
        onReplace={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Main hand: Longsword" }));
    await user.click(screen.getByRole("button", { name: "Unequip" }));
    expect(onUnequip).toHaveBeenCalledWith(equipped);
  });

  it("swaps a filled slot for a bag candidate", async () => {
    const user = userEvent.setup();
    const onReplace = vi.fn();
    const equipped = item({ id: "worn", name: "Old Blade" });
    const candidate = item({ id: "new", name: "Fine Blade" });
    render(
      <EquipSlotCell
        slot="MAIN_HAND"
        label="Main hand"
        item={equipped}
        locked={false}
        candidates={[candidate]}
        pending={false}
        onEquip={vi.fn()}
        onUnequip={vi.fn()}
        onReplace={onReplace}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Main hand: Old Blade" }));
    await user.click(screen.getByRole("button", { name: "Swap" }));
    await user.click(screen.getByRole("button", { name: /Equip & replace: Fine Blade/ }));
    expect(onReplace).toHaveBeenCalledWith(candidate, equipped);
  });

  it("flags a not-proficient equipped item", async () => {
    const user = userEvent.setup();
    render(
      <EquipSlotCell
        slot="MAIN_HAND"
        label="Main hand"
        item={item({ id: "axe", name: "Greataxe" })}
        locked={false}
        notProficient
        candidates={[]}
        pending={false}
        onEquip={vi.fn()}
        onUnequip={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    expect(screen.getByText("Not proficient")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Main hand: Greataxe (not proficient)" }));
    expect(screen.getByText("Not proficient with this item")).toBeInTheDocument();
  });
});

describe("EquipSlotCell — empty branch", () => {
  it("renders an empty slot and equips a picked candidate", async () => {
    const user = userEvent.setup();
    const onEquip = vi.fn();
    const candidate = item({ id: "potion", name: "Potion" });
    render(
      <EquipSlotCell
        slot="MAIN_HAND"
        label="Main hand"
        item={null}
        locked={false}
        candidates={[candidate]}
        pending={false}
        onEquip={onEquip}
        onUnequip={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Main hand slot, empty — equip an item" }));
    await user.click(screen.getByRole("button", { name: /Potion/ }));
    expect(onEquip).toHaveBeenCalledWith(candidate);
  });
});
