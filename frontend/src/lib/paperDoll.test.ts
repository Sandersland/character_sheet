import { describe, it, expect } from "vitest";

import type { InventoryItem } from "@/types/character";
import {
  bagItemsForSlot,
  equippedLoadoutLabel,
  equipSlotLabel,
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
    equippable: false,
    allowedSlots: [],
    proficient: true,
    ...overrides,
  };
}

const weapon = (twoHanded = false, o: Partial<InventoryItem> = {}) =>
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

const shield = (o: Partial<InventoryItem> = {}) =>
  item({ category: "armor", equippable: true, allowedSlots: ["OFF_HAND"], armor: { armorCategory: "shield", baseArmorClass: 2, dexModifierApplies: false, stealthDisadvantage: false }, ...o });

describe("equipSlotLabel", () => {
  it("humanizes underscored slot keys", () => {
    expect(equipSlotLabel("MAIN_HAND")).toBe("Main hand");
    expect(equipSlotLabel("RING")).toBe("Ring");
  });
});

describe("equippedLoadoutLabel (#733)", () => {
  const inSlot = (slot: "MAIN_HAND" | "OFF_HAND", o: Partial<InventoryItem>) =>
    ({ ...o, equipped: true, equippedSlot: slot }) as InventoryItem;

  it("returns Unarmed when both hands are empty", () => {
    expect(equippedLoadoutLabel([], false)).toBe("Unarmed");
  });

  it("joins main + off with an ampersand", () => {
    const inv = [
      inSlot("MAIN_HAND", weapon(false, { name: "Longsword" })),
      inSlot("OFF_HAND", shield({ name: "Shield" })),
    ];
    expect(equippedLoadoutLabel(inv, false)).toBe("Longsword & Shield");
  });

  it("collapses two identical weapons", () => {
    const inv = [
      inSlot("MAIN_HAND", weapon(false, { name: "Dagger" })),
      inSlot("OFF_HAND", weapon(false, { name: "Dagger" })),
    ];
    expect(equippedLoadoutLabel(inv, false)).toBe("Two daggers");
  });

  // The served flag decides, not the row's own twoHanded bit: a one-handed
  // main-hand weapon still collapses to the two-handed label when locked.
  it("omits the off-hand segment when the served flag says the hands are locked", () => {
    const inv = [inSlot("MAIN_HAND", weapon(false, { name: "Greatsword" }))];
    expect(equippedLoadoutLabel(inv, true)).toBe("Greatsword (two-handed)");
  });

  it("handles a lone main-hand weapon (empty off-hand)", () => {
    expect(equippedLoadoutLabel([inSlot("MAIN_HAND", weapon(false, { name: "Rapier" }))], false)).toBe("Rapier");
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

describe("bagItemsForSlot", () => {
  // Filters the SERVED allowedSlots, so a row's category/detail data no longer
  // decides candidacy — this is what the fixtures below set.
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
    const inv = [item({ id: "hat", slot: "HEAD", allowedSlots: ["HEAD"], equippedSlot: "HEAD" })];
    expect(bagItemsForSlot(inv, "HEAD")).toEqual([]);
  });

  it("honours the served flag over the row's own category/detail data", () => {
    // A two-handed greatsword the server reports as off-hand-legal IS offered:
    // the client no longer second-guesses allowedSlots.
    const inv = [weapon(true, { id: "gs", name: "Greatsword", allowedSlots: ["MAIN_HAND", "OFF_HAND"] })];
    expect(bagItemsForSlot(inv, "OFF_HAND").map((i) => i.id)).toEqual(["gs"]);
    // And a one-handed sword the server reports as main-hand-only is NOT.
    const restricted = [weapon(false, { id: "ls", name: "Longsword", allowedSlots: ["MAIN_HAND"] })];
    expect(bagItemsForSlot(restricted, "OFF_HAND")).toEqual([]);
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

describe("versatileGrip (#554)", () => {
  const versatile = (grip: "one-handed" | "two-handed" | "versatile-two-handed", faces: number) =>
    weapon(false, {
      name: "Longsword",
      weapon: {
        ...weapon().weapon!,
        versatileDiceCount: 1,
        versatileDiceFaces: 10,
        damage: { damageDiceCount: 1, damageDiceFaces: faces, damageModifier: 0, abilityModifier: 0, damageType: "slashing", grip },
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
