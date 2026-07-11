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

// A versatile weapon carrying the server-derived grip snapshot the doll reads.
const versatileWeapon = (
  grip: "one-handed" | "versatile-two-handed",
  faces: number,
  o: Partial<InventoryItem> = {},
) =>
  weapon(false, {
    name: "Longsword",
    weapon: {
      ...weapon(false).weapon!,
      weaponClass: "martial",
      versatileDiceCount: 1,
      versatileDiceFaces: 10,
      damage: { damageDiceCount: 1, damageDiceFaces: faces, damageModifier: 0, abilityModifier: 0, damageType: "slashing", grip },
    },
    ...o,
  });

interface Profs {
  weapon?: { name: string }[];
  armor?: { category: string }[];
}

function makeCharacter(inventory: InventoryItem[], profs: Profs = {}): Character {
  return {
    id: "char-1",
    name: "Aria",
    armorClass: 15,
    inventory,
    weaponProficiencies: profs.weapon ?? [],
    armorProficiencies: profs.armor ?? [],
  } as unknown as Character;
}

function renderDoll(
  inventory: InventoryItem[],
  onSubmit = vi.fn().mockResolvedValue(undefined),
  profs: Profs = {},
) {
  render(
    <EquipmentDoll character={makeCharacter(inventory, profs)} pending={false} onSubmit={onSubmit} />,
  );
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

  it("ghosts the two-handed weapon into the off-hand and focuses it on click (#554)", async () => {
    const user = userEvent.setup();
    renderDoll([weapon(true, { id: "gs", name: "Greatsword", equippedSlot: "MAIN_HAND" })]);
    const lock = screen.getByRole("button", { name: /Off hand held by two-handed Greatsword/ });
    expect(lock).toBeInTheDocument();
    expect(screen.getByText("Two-handed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Off hand slot, empty/ })).toBeNull();
    // Clicking the ghosted off-hand jumps focus to its main-hand owner.
    await user.click(lock);
    expect(screen.getByRole("button", { name: /Main hand: Greatsword/ })).toHaveFocus();
  });

  it("warns on a non-proficient equipped item but not a proficient one (#554)", () => {
    const martial = weapon(false, {
      id: "gs",
      name: "Greataxe",
      equippedSlot: "MAIN_HAND",
      weapon: { ...weapon(false).weapon!, weaponClass: "martial" },
    });
    // No proficiencies granted → the tile warns.
    const { unmount } = render(
      <EquipmentDoll character={makeCharacter([martial])} pending={false} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText("Not proficient")).toBeInTheDocument();
    unmount();

    // Martial Weapons granted → no warning.
    renderDoll([martial], vi.fn(), { weapon: [{ name: "Martial Weapons" }] });
    expect(screen.queryByText("Not proficient")).toBeNull();
  });

  it("shows the versatile grip die on the main-hand tile and flips it (#554)", () => {
    const prof: Profs = { weapon: [{ name: "Martial Weapons" }] };
    const { unmount } = render(
      <EquipmentDoll
        character={makeCharacter(
          [versatileWeapon("versatile-two-handed", 10, { id: "ls", equippedSlot: "MAIN_HAND" })],
          prof,
        )}
        pending={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("1d10")).toBeInTheDocument();
    unmount();

    // Off-hand filled → server derives the one-handed die; the badge flips.
    renderDoll(
      [versatileWeapon("one-handed", 8, { id: "ls", equippedSlot: "MAIN_HAND" })],
      vi.fn(),
      prof,
    );
    expect(screen.getByText("1d8")).toBeInTheDocument();
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
