import { describe, it, expect } from "vitest";

import type { InventoryItem } from "@/types/character";
import {
  allowedSlotsForItem,
  bagItemsForSlot,
  equipSlotLabel,
  hasEquipSlots,
  isOffHandLocked,
  isProficientWithItem,
  itemsInSlot,
  SLOT_GROUPS,
  versatileGrip,
  WORN_SLOTS,
  wornSlotItemKindLabel,
} from "@/lib/paperDoll";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "x",
    name: "Item",
    category: "gear",
    quantity: 1,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    ...overrides,
  };
}

const weapon = (twoHanded = false, o: Partial<InventoryItem> = {}) =>
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

const shield = (o: Partial<InventoryItem> = {}) =>
  item({ category: "armor", armor: { armorCategory: "shield", baseArmorClass: 2, dexModifierApplies: false, stealthDisadvantage: false }, ...o });

const bodyArmor = (o: Partial<InventoryItem> = {}) =>
  item({ category: "armor", armor: { armorCategory: "medium", baseArmorClass: 14, dexModifierApplies: true, stealthDisadvantage: false }, ...o });

describe("equipSlotLabel", () => {
  it("humanizes underscored slot keys", () => {
    expect(equipSlotLabel("MAIN_HAND")).toBe("Main hand");
    expect(equipSlotLabel("RING")).toBe("Ring");
  });
});

describe("allowedSlotsForItem", () => {
  it("one-handed weapon fits both hands", () => {
    expect(allowedSlotsForItem(weapon(false))).toEqual(["MAIN_HAND", "OFF_HAND"]);
  });

  it("two-handed weapon is main-hand only", () => {
    expect(allowedSlotsForItem(weapon(true))).toEqual(["MAIN_HAND"]);
  });

  it("shield is off-hand; body armor is body", () => {
    expect(allowedSlotsForItem(shield())).toEqual(["OFF_HAND"]);
    expect(allowedSlotsForItem(bodyArmor())).toEqual(["BODY"]);
  });

  it("gear uses its declared slot; slotless gear has none", () => {
    expect(allowedSlotsForItem(item({ slot: "HEAD" }))).toEqual(["HEAD"]);
    expect(allowedSlotsForItem(item())).toEqual([]);
  });

  it("consumables are never equippable", () => {
    expect(allowedSlotsForItem(item({ category: "consumable" }))).toEqual([]);
    expect(hasEquipSlots(item({ category: "consumable" }))).toBe(false);
  });
});

describe("itemsInSlot", () => {
  it("returns items placed in the slot, id-sorted", () => {
    const inv = [
      item({ id: "b", slot: "RING", equippedSlot: "RING" }),
      item({ id: "a", slot: "RING", equippedSlot: "RING" }),
      item({ id: "c", slot: "HEAD", equippedSlot: "HEAD" }),
    ];
    expect(itemsInSlot(inv, "RING").map((i) => i.id)).toEqual(["a", "b"]);
    expect(itemsInSlot(inv, "HEAD").map((i) => i.id)).toEqual(["c"]);
  });

  it("empty when nothing is placed there", () => {
    expect(itemsInSlot([item()], "BODY")).toEqual([]);
  });
});

describe("isOffHandLocked", () => {
  it("true only when a two-handed weapon holds the main hand", () => {
    expect(isOffHandLocked([weapon(true, { equippedSlot: "MAIN_HAND" })])).toBe(true);
  });

  it("false for a one-handed main-hand weapon", () => {
    expect(isOffHandLocked([weapon(false, { equippedSlot: "MAIN_HAND" })])).toBe(false);
  });

  it("false when the two-hander is still in the bag", () => {
    expect(isOffHandLocked([weapon(true)])).toBe(false);
  });
});

describe("bagItemsForSlot", () => {
  it("lists only unequipped, slot-compatible items", () => {
    const inv = [
      weapon(false, { id: "sword", name: "Sword" }),
      weapon(false, { id: "worn", name: "Worn", equippedSlot: "MAIN_HAND" }),
      shield({ id: "shield", name: "Shield" }),
    ];
    expect(bagItemsForSlot(inv, "MAIN_HAND").map((i) => i.id)).toEqual(["sword"]);
    expect(bagItemsForSlot(inv, "OFF_HAND").map((i) => i.id)).toEqual(["shield", "sword"]);
  });

  it("excludes an already-equipped candidate", () => {
    const inv = [item({ id: "hat", slot: "HEAD", equippedSlot: "HEAD" })];
    expect(bagItemsForSlot(inv, "HEAD")).toEqual([]);
  });
});

describe("WORN_SLOTS (#572)", () => {
  it("lists exactly the eight worn slots, excluding the derived ones", () => {
    expect(WORN_SLOTS).toEqual(["HEAD", "NECK", "CLOAK", "HANDS", "WRISTS", "BELT", "FEET", "RING"]);
    expect(WORN_SLOTS).not.toContain("MAIN_HAND");
    expect(WORN_SLOTS).not.toContain("OFF_HAND");
    expect(WORN_SLOTS).not.toContain("BODY");
  });

  it("labels each worn slot by item kind, not body location", () => {
    expect(wornSlotItemKindLabel("HANDS")).toBe("Gloves");
    expect(wornSlotItemKindLabel("WRISTS")).toBe("Bracers");
    expect(wornSlotItemKindLabel("NECK")).toBe("Amulet / Necklace");
    expect(wornSlotItemKindLabel("HEAD")).toBe("Headwear");
    expect(wornSlotItemKindLabel("FEET")).toBe("Boots");
    expect(wornSlotItemKindLabel("RING")).toBe("Ring");
  });
});

describe("isProficientWithItem (#554)", () => {
  const simpleSword = weapon(false, { name: "Club", weapon: { ...weapon().weapon!, weaponClass: "simple" } });
  const martialSword = weapon(false, { name: "Longsword", weapon: { ...weapon().weapon!, weaponClass: "martial" } });

  it("matches weapon category grants against weaponClass", () => {
    expect(isProficientWithItem(simpleSword, [{ name: "Simple Weapons" }], [])).toBe(true);
    expect(isProficientWithItem(martialSword, [{ name: "Simple Weapons" }], [])).toBe(false);
    expect(isProficientWithItem(martialSword, [{ name: "Martial Weapons" }], [])).toBe(true);
  });

  it("matches a pluralised specific-weapon grant against the singular catalog name", () => {
    expect(isProficientWithItem(martialSword, [{ name: "Longswords" }], [])).toBe(true);
    expect(isProficientWithItem(martialSword, [{ name: "Shortswords" }], [])).toBe(false);
  });

  it("warns (false) when no grant covers the weapon", () => {
    expect(isProficientWithItem(martialSword, [{ name: "Simple Weapons" }], [])).toBe(false);
    expect(isProficientWithItem(simpleSword, [], [])).toBe(false);
  });

  it("matches armor by category, including shields", () => {
    expect(isProficientWithItem(bodyArmor(), [], [{ category: "medium" }])).toBe(true);
    expect(isProficientWithItem(bodyArmor(), [], [{ category: "light" }])).toBe(false);
    expect(isProficientWithItem(shield(), [], [{ category: "shield" }])).toBe(true);
  });

  it("never warns on items that carry no proficiency requirement", () => {
    expect(isProficientWithItem(item(), [], [])).toBe(true); // gear
    expect(isProficientWithItem(item({ category: "consumable" }), [], [])).toBe(true);
    // A weapon with no derivable class (e.g. homebrew) carries no requirement.
    expect(isProficientWithItem(weapon(false), [], [])).toBe(true);
  });
});

describe("versatileGrip (#554)", () => {
  const versatile = (grip: "one-handed" | "two-handed" | "versatile-two-handed", faces: number) =>
    weapon(false, {
      name: "Longsword",
      weapon: {
        ...weapon().weapon!,
        versatileDiceCount: 1,
        versatileDiceFaces: 10,
        damage: { damageDiceCount: 1, damageDiceFaces: faces, damageModifier: 0, damageType: "slashing", grip },
      },
    });

  it("shows the two-handed die + caption when the off-hand is free", () => {
    expect(versatileGrip(versatile("versatile-two-handed", 10))).toEqual({
      short: "1d10",
      full: "1d10 · two-handed grip",
    });
  });

  it("shows the one-handed die alone when a shield/weapon fills the off-hand", () => {
    expect(versatileGrip(versatile("one-handed", 8))).toEqual({ short: "1d8", full: "1d8" });
  });

  it("is null for a non-versatile weapon and for a weapon with no derived damage", () => {
    expect(versatileGrip(weapon(false))).toBeNull();
    expect(
      versatileGrip(
        weapon(false, { weapon: { ...weapon().weapon!, versatileDiceCount: 1, versatileDiceFaces: 10 } }),
      ),
    ).toBeNull();
  });
});

describe("SLOT_GROUPS", () => {
  it("covers all eleven slots exactly once across the three groups", () => {
    const all = [
      ...SLOT_GROUPS.hands.slots,
      ...SLOT_GROUPS.armor.slots,
      ...SLOT_GROUPS.adornment.slots,
    ];
    expect(new Set(all).size).toBe(11);
    expect(all).toContain("RING");
  });
});
