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
  attuned: false,
  requiresAttunement: false,
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

  it("shows the charge-pool pill with the recharge tooltip (#555)", () => {
    renderRow({
      item: {
        ...mockItem,
        name: "Wand of Magic Missiles",
        category: "gear",
        weapon: undefined,
        charges: { max: 7, remaining: 4, recharge: "regains 1d6+1 at dawn" },
      },
    });
    const pill = screen.getByText("4/7 charges");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("title", "regains 1d6+1 at dawn");
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

// Characterization tests locking the edit-form submit payload before the
// InventoryRow decomposition (#292). Exact InventoryOperation[] assertions.
describe("InventoryRow (edit mode)", () => {
  const weaponItem: InventoryItem = {
    id: "w1",
    name: "Club",
    category: "weapon",
    quantity: 2,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
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

  const armorItem: InventoryItem = {
    id: "a1",
    name: "Leather Armor",
    category: "armor",
    quantity: 1,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    armor: {
      armorCategory: "light",
      baseArmorClass: 11,
      dexModifierApplies: true,
      stealthDisadvantage: false,
    },
  };

  const consumableItem: InventoryItem = {
    id: "c1",
    name: "Potion of Healing",
    category: "consumable",
    quantity: 3,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    consumable: {
      effectDiceCount: 2,
      effectDiceFaces: 4,
      effectModifier: 2,
      effectDescription: "Restores hit points",
    },
  };

  function renderEdit(item: InventoryItem) {
    return renderRow({ item, mode: "edit" });
  }

  it("Cancel calls onCancel without submitting", async () => {
    const user = userEvent.setup();
    const { props } = renderEdit(weaponItem);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("submits the exact update + adjustQuantity payload for a weapon", async () => {
    const user = userEvent.setup();
    const { props } = renderEdit(weaponItem);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Club +1");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "3");
    await user.click(screen.getByRole("checkbox", { name: "Equipped" }));
    await user.type(screen.getByLabelText("Notes"), "magic");

    // Spinbuttons in DOM order: Quantity, dmg count, dmg faces, dmg mod, vers count, vers faces.
    const spins = screen.getAllByRole("spinbutton");
    await user.clear(spins[2]);
    await user.type(spins[2], "6");
    await user.clear(spins[3]);
    await user.type(spins[3], "2");
    await user.type(spins[4], "1");
    await user.type(spins[5], "8");
    await user.clear(screen.getByLabelText("Damage type"));
    await user.type(screen.getByLabelText("Damage type"), "slashing");
    await user.click(screen.getByRole("checkbox", { name: "finesse" }));
    await user.click(screen.getByRole("checkbox", { name: "two-handed" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onSubmit).toHaveBeenCalledWith([
      {
        type: "update",
        inventoryItemId: "w1",
        name: "Club +1",
        notes: "magic",
        equipped: true,
        weapon: {
          damageDiceCount: 1,
          damageDiceFaces: 6,
          damageModifier: 2,
          damageType: "slashing",
          versatileDiceCount: 1,
          versatileDiceFaces: 8,
          finesse: true,
          light: true,
          heavy: false,
          twoHanded: true,
          reach: false,
          thrown: false,
          ammunition: false,
        },
        armor: undefined,
        consumable: undefined,
      },
      { type: "adjustQuantity", inventoryItemId: "w1", delta: 1 },
    ]);
  });

  it("emits notes:null when the notes field is cleared", async () => {
    const user = userEvent.setup();
    const withNotes: InventoryItem = { ...weaponItem, notes: "old note" };
    const { props } = renderEdit(withNotes);
    await user.clear(screen.getByLabelText("Notes"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ type: "update", inventoryItemId: "w1", notes: null }),
    ]);
  });

  it("omits adjustQuantity when the quantity is unchanged", async () => {
    const user = userEvent.setup();
    const { props } = renderEdit(weaponItem);
    await user.click(screen.getByRole("button", { name: "Save" }));
    // A one-element array match asserts no trailing adjustQuantity op.
    expect(props.onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ type: "update", inventoryItemId: "w1" }),
    ]);
  });

  it("submits the exact update payload for armor", async () => {
    const user = userEvent.setup();
    const { props } = renderEdit(armorItem);

    await user.selectOptions(screen.getByLabelText("Armor type"), "heavy");
    await user.clear(screen.getByLabelText("Base AC"));
    await user.type(screen.getByLabelText("Base AC"), "18");
    await user.click(screen.getByRole("checkbox", { name: "Dex applies" }));
    await user.click(screen.getByRole("checkbox", { name: "Stealth disadvantage" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onSubmit).toHaveBeenCalledWith([
      {
        type: "update",
        inventoryItemId: "a1",
        name: "Leather Armor",
        notes: null,
        equipped: false,
        weapon: undefined,
        armor: {
          armorCategory: "heavy",
          baseArmorClass: 18,
          dexModifierApplies: false,
          stealthDisadvantage: true,
        },
        consumable: undefined,
      },
    ]);
  });

  it("submits the exact update payload for a consumable", async () => {
    const user = userEvent.setup();
    const { props } = renderEdit(consumableItem);

    // Spinbuttons in DOM order: Quantity, effect count, effect faces, effect modifier.
    const spins = screen.getAllByRole("spinbutton");
    await user.clear(spins[1]);
    await user.type(spins[1], "3");
    await user.clear(spins[2]);
    await user.type(spins[2], "8");
    await user.clear(spins[3]);
    await user.type(spins[3], "0");
    await user.clear(screen.getByLabelText("Effect description"));
    await user.type(screen.getByLabelText("Effect description"), "Restores more HP");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onSubmit).toHaveBeenCalledWith([
      {
        type: "update",
        inventoryItemId: "c1",
        name: "Potion of Healing",
        notes: null,
        equipped: false,
        weapon: undefined,
        armor: undefined,
        consumable: {
          effectDiceCount: 3,
          effectDiceFaces: 8,
          effectModifier: 0,
          effectDescription: "Restores more HP",
        },
      },
    ]);
  });
});
