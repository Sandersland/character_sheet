import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LoadoutList from "@/features/inventory/LoadoutList";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import { seedItemRarities } from "@/test/rarities";
import type { Character, InventoryItem } from "@/types/character";

// equippable/allowedSlots/proficient are served per row (#1433) — the fixtures
// set them rather than letting the component re-derive from category/twoHanded,
// which is exactly the behaviour this suite now pins.
function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "i",
    name: "Item",
    category: "gear",
    quantity: 1,
    equipped: false,
    attuned: false,
    weaponBonded: false,
    requiresAttunement: false,
    equippable: false,
    allowedSlots: [],
    proficient: true,
    ...overrides,
  };
}

const weapon = (twoHanded: boolean, o: Partial<InventoryItem> = {}) =>
  item({
    category: "weapon",
    equippable: true,
    allowedSlots: twoHanded ? ["MAIN_HAND"] : ["MAIN_HAND", "OFF_HAND"],
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

const ring = (o: Partial<InventoryItem> = {}) => item({ category: "gear", slot: "RING", allowedSlots: ["RING"], ...o });

// LoadoutList resolves rarity labels through useItemRarities(character
// .rulesEdition) (#1437), so the fixture carries an edition and every render
// seeds that edition's reference cache.
function makeCharacter(inventory: InventoryItem[], over: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Aria",
    rulesEdition: "EDITION_2024",
    armorClass: 15,
    inventory,
    weaponProficiencies: [],
    armorProficiencies: [],
    offHandLocked: false,
    // Served, not a local constant (#1377) — the attunement header reads it.
    attunementCap: 3,
    ...over,
  } as unknown as Character;
}

// LoadoutList reads useCurrentCharacter(), so every render seeds the cache and
// mounts CurrentCharacterProvider via renderWithCharacter.
function renderList(
  inventory: InventoryItem[],
  onSubmit = vi.fn().mockResolvedValue(undefined),
  over: Partial<Character> = {},
) {
  const character = makeCharacter(inventory, over);
  seedItemRarities("EDITION_2024");
  renderWithCharacter(<LoadoutList pending={false} onSubmit={onSubmit} />, character);
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

  // The served character flag drives the lock, not the row's own twoHanded bit:
  // a ONE-handed main-hand weapon still locks the off-hand when the server says so.
  it("shows a locked off-hand row (no picker) from the served offHandLocked flag", () => {
    renderList([weapon(false, { id: "ls", name: "Longsword", equippedSlot: "MAIN_HAND" })], vi.fn(), {
      offHandLocked: true,
    });
    expect(screen.getByText("Held by Longsword (two-handed)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equip Off hand" })).toBeNull();
  });

  it("leaves the off-hand pickable when offHandLocked is false, even for a two-handed row", () => {
    renderList([weapon(true, { id: "gs", name: "Greatsword", equippedSlot: "MAIN_HAND" })]);
    expect(screen.queryByText(/Held by/)).toBeNull();
    expect(screen.getByRole("button", { name: "Equip Off hand" })).toBeInTheDocument();
  });

  // The served per-row flag drives the warning, not character.weaponProficiencies:
  // the proficient case keeps that array EMPTY, which would warn on staging.
  it("warns from the served proficient flag, not the character's grant list", () => {
    const martial = (proficient: boolean) =>
      weapon(false, {
        id: "axe",
        name: "Greataxe",
        equippedSlot: "MAIN_HAND",
        proficient,
        weapon: { ...weapon(false).weapon!, weaponClass: "martial" },
      });
    const { unmount } = renderWithCharacter(
      <LoadoutList pending={false} onSubmit={vi.fn()} />,
      makeCharacter([martial(false)], { weaponProficiencies: [{ name: "Martial Weapons", source: "class" }] }),
    );
    expect(screen.getByText("Not proficient")).toBeInTheDocument();
    unmount();

    renderList([martial(true)]);
    expect(screen.queryByText("Not proficient")).toBeNull();
  });

  // #1437: labels come off the wire, so seeded → the label + its tone, and a
  // cold cache → no badge at all rather than a flash of the raw enum key.
  it("badges an equipped magic item with the served label and its tone", () => {
    renderList([ring({ id: "band", name: "Ring of Protection", rarity: "VERY_RARE", equippedSlot: "RING" })]);
    const badge = screen.getByText("Very Rare");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-arcane-50");
    expect(screen.queryByText("VERY_RARE")).toBeNull();
  });

  it("renders no rarity badge while the served rows are unresolved", () => {
    // No seedItemRarities() — the reference query is still pending.
    renderWithCharacter(
      <LoadoutList pending={false} onSubmit={vi.fn()} />,
      makeCharacter([ring({ id: "band", name: "Ring of Protection", rarity: "VERY_RARE", equippedSlot: "RING" })]),
    );
    expect(screen.getByText("Ring of Protection")).toBeInTheDocument();
    expect(screen.queryByText("VERY_RARE")).toBeNull();
    expect(screen.queryByText("Very Rare")).toBeNull();
  });

  // COMMON is deliberately suppressed on the paper doll — every mundane row
  // would otherwise carry a badge that says nothing.
  it("suppresses the COMMON badge even once the rows have resolved", () => {
    renderList([ring({ id: "band", name: "Plain Band", rarity: "COMMON", equippedSlot: "RING" })]);
    expect(screen.getByText("Plain Band")).toBeInTheDocument();
    expect(screen.queryByText("Common")).toBeNull();
  });

  it("shows the versatile grip badge on the main-hand row", () => {
    renderList([versatileWeapon("versatile-two-handed", 10, { id: "ls", equippedSlot: "MAIN_HAND" })]);
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
    const { unmount } = renderWithCharacter(
      <LoadoutList pending={false} onSubmit={vi.fn()} />,
      makeCharacter([
        attunableRing({ id: "a", name: "Ring A", attuned: true }),
        attunableRing({ id: "b", name: "Ring B", attuned: true }),
      ]),
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

  it("renders the SERVED cap in the header, not a local 3 (#1377)", () => {
    renderList(
      [attunableRing({ id: "a", name: "Ring A", attuned: true })],
      vi.fn(),
      { attunementCap: 5 },
    );
    expect(screen.getByText("Attuned 1/5")).toBeInTheDocument();
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
    const { unmount } = renderWithCharacter(
      <LoadoutList pending={false} onSubmit={vi.fn()} />,
      makeCharacter(belowCap),
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
