import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LoadoutList from "@/features/inventory/LoadoutList";
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

const versatileWeapon = (grip: "one-handed" | "versatile-two-handed", faces: number, o: Partial<InventoryItem> = {}) =>
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

const ring = (o: Partial<InventoryItem> = {}) => item({ category: "gear", slot: "RING", ...o });

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

function renderList(
  inventory: InventoryItem[],
  onSubmit = vi.fn().mockResolvedValue(undefined),
  profs: Profs = {},
) {
  render(<LoadoutList character={makeCharacter(inventory, profs)} pending={false} onSubmit={onSubmit} />);
  return { onSubmit };
}

describe("LoadoutList groups & rows", () => {
  it("renders the renamed group headings", () => {
    renderList([]);
    expect(screen.getByText("Weapons")).toBeInTheDocument();
    expect(screen.getByText("Armor")).toBeInTheDocument();
    expect(screen.getByText("Accessories")).toBeInTheDocument();
  });

  it("renders a filled row showing the equipped item name", () => {
    renderList([weapon(false, { id: "sword", name: "Longsword", equippedSlot: "MAIN_HAND" })]);
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Main hand: Longsword/ })).toBeInTheDocument();
  });

  it("renders RING as two independent rows", () => {
    renderList([ring({ id: "band", name: "Signet Band", equippedSlot: "RING" })]);
    expect(screen.getByText("Signet Band")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Equip Ring 2" })).toBeInTheDocument();
  });

  it("shows a locked off-hand row (no picker) when a two-handed weapon is main-hand", () => {
    renderList([weapon(true, { id: "gs", name: "Greatsword", equippedSlot: "MAIN_HAND" })]);
    expect(screen.getByText("Held by Greatsword (two-handed)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equip Off hand" })).toBeNull();
  });

  it("warns on a non-proficient equipped item but not a proficient one", () => {
    const martial = weapon(false, {
      id: "axe",
      name: "Greataxe",
      equippedSlot: "MAIN_HAND",
      weapon: { ...weapon(false).weapon!, weaponClass: "martial" },
    });
    const { unmount } = render(
      <LoadoutList character={makeCharacter([martial])} pending={false} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText("Not proficient")).toBeInTheDocument();
    unmount();

    renderList([martial], vi.fn(), { weapon: [{ name: "Martial Weapons" }] });
    expect(screen.queryByText("Not proficient")).toBeNull();
  });

  it("shows the versatile grip badge on the main-hand row", () => {
    renderList(
      [versatileWeapon("versatile-two-handed", 10, { id: "ls", equippedSlot: "MAIN_HAND" })],
      vi.fn(),
      { weapon: [{ name: "Martial Weapons" }] },
    );
    expect(screen.getByText("1d10")).toBeInTheDocument();
  });
});

describe("LoadoutList equip / unequip / swap", () => {
  it("opens an empty-slot picker and equips a compatible bag item", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderList([
      weapon(false, { id: "sword", name: "Longsword" }),
      item({ id: "potion", name: "Potion", category: "consumable" }),
    ]);

    await user.click(screen.getByRole("button", { name: "Equip Main hand" }));
    expect(screen.getByText("Equip Main hand")).toBeInTheDocument();
    expect(screen.queryByText("Potion")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    expect(onSubmit).toHaveBeenCalledWith([
      { type: "equip", inventoryItemId: "sword", slot: "MAIN_HAND" },
    ]);
  });

  it("unequips from a filled row", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderList([
      weapon(false, { id: "sword", name: "Longsword", equippedSlot: "MAIN_HAND" }),
    ]);

    await user.click(screen.getByRole("button", { name: /Main hand: Longsword/ }));
    await user.click(screen.getByRole("button", { name: "Unequip" }));
    expect(onSubmit).toHaveBeenCalledWith([
      { type: "setEquipped", inventoryItemId: "sword", equipped: false },
    ]);
  });

  it("swap from a filled row batches an unequip + equip atomically", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderList([
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

const attunableRing = (o: Partial<InventoryItem> = {}) =>
  ring({ requiresAttunement: true, rarity: "RARE", equippedSlot: "RING", ...o });

describe("LoadoutList attunement", () => {
  it("shows the Attuned N/3 header reflecting the real count", () => {
    const { unmount } = render(
      <LoadoutList
        character={makeCharacter([
          attunableRing({ id: "a", name: "Ring A", attuned: true }),
          attunableRing({ id: "b", name: "Ring B", attuned: true }),
        ])}
        pending={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("Attuned 2/3")).toBeInTheDocument();
    unmount();

    renderList([
      attunableRing({ id: "a", name: "Ring A", attuned: true }),
      attunableRing({ id: "b", name: "Ring B", attuned: true }),
      item({ id: "c", name: "Cloak", slot: "CLOAK", equippedSlot: "CLOAK", requiresAttunement: true, attuned: true }),
    ]);
    expect(screen.getByText("Attuned 3/3")).toBeInTheDocument();
  });

  it("renders an Attune control only for items requiring attunement", () => {
    renderList([
      attunableRing({ id: "a", name: "Ring A" }),
      weapon(false, { id: "sword", name: "Longsword", equippedSlot: "MAIN_HAND" }),
    ]);
    expect(screen.getAllByRole("button", { name: "Attune" })).toHaveLength(1);
  });

  it("disables Attune at the 3-item cap and enables it below", () => {
    const belowCap = [attunableRing({ id: "a", name: "Ring A" })];
    const { unmount } = render(
      <LoadoutList character={makeCharacter(belowCap)} pending={false} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Attune" })).toBeEnabled();
    unmount();

    const atCap = [
      attunableRing({ id: "a", name: "Ring A" }),
      item({ id: "c1", name: "Cloak", slot: "CLOAK", equippedSlot: "CLOAK", requiresAttunement: true, attuned: true }),
      item({ id: "b1", name: "Belt", slot: "BELT", equippedSlot: "BELT", requiresAttunement: true, attuned: true }),
      item({ id: "h1", name: "Helm", slot: "HEAD", equippedSlot: "HEAD", requiresAttunement: true, attuned: true }),
    ];
    renderList(atCap);
    expect(screen.getByRole("button", { name: "Attune" })).toBeDisabled();
  });

  it("fires an attune op when toggling an unattuned item", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderList([attunableRing({ id: "a", name: "Ring A" })]);
    await user.click(screen.getByRole("button", { name: "Attune" }));
    expect(onSubmit).toHaveBeenCalledWith([{ type: "attune", inventoryItemId: "a" }]);
  });

  it("shows an Attuned tag and fires unattune on an attuned item", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderList([attunableRing({ id: "a", name: "Ring A", attuned: true })]);
    const toggle = screen.getByRole("button", { name: "Attuned" });
    expect(toggle).toBeInTheDocument();
    await user.click(toggle);
    expect(onSubmit).toHaveBeenCalledWith([{ type: "unattune", inventoryItemId: "a" }]);
  });
});
