import { describe, expect, it } from "vitest";

import {
  allowedSlotsForItem,
  isOffHandLocked,
  type EquippedRow,
  type PlaceableItem,
} from "@/lib/inventory/inventory-placement.js";

// #1432/#1433: serializeCharacter serves these as `allowedSlots` / `offHandLocked`, so a divergence here changes what the sheet renders, not just what a write rejects.

function placeable(overrides: Partial<PlaceableItem> = {}): PlaceableItem {
  return { category: "gear", slot: null, weaponDetail: null, armorDetail: null, ...overrides };
}

describe("allowedSlotsForItem", () => {
  it("one-handed weapon fits both hands", () => {
    const item = placeable({ category: "weapon", weaponDetail: { twoHanded: false } });
    expect(allowedSlotsForItem(item)).toEqual(["MAIN_HAND", "OFF_HAND"]);
  });

  it("two-handed weapon is main-hand only", () => {
    const item = placeable({ category: "weapon", weaponDetail: { twoHanded: true } });
    expect(allowedSlotsForItem(item)).toEqual(["MAIN_HAND"]);
  });

  it("shield is off-hand", () => {
    const item = placeable({ category: "armor", armorDetail: { armorCategory: "shield" } });
    expect(allowedSlotsForItem(item)).toEqual(["OFF_HAND"]);
  });

  it("body armor is body", () => {
    const item = placeable({ category: "armor", armorDetail: { armorCategory: "medium" } });
    expect(allowedSlotsForItem(item)).toEqual(["BODY"]);
  });

  // A detail-less armor row falls to BODY rather than the shield branch, keeping applySetEquipped from rejecting armor whose detail row failed to load.
  it("armor with no detail row falls back to body", () => {
    expect(allowedSlotsForItem(placeable({ category: "armor" }))).toEqual(["BODY"]);
  });

  it("gear uses its declared slot", () => {
    expect(allowedSlotsForItem(placeable({ slot: "HEAD" }))).toEqual(["HEAD"]);
  });

  it("slotless gear has no legal slot", () => {
    expect(allowedSlotsForItem(placeable())).toEqual([]);
  });

  it("consumables are never equippable", () => {
    expect(allowedSlotsForItem(placeable({ category: "consumable" }))).toEqual([]);
  });
});

describe("isOffHandLocked", () => {
  const row = (overrides: Partial<EquippedRow> = {}): EquippedRow => ({
    equippedSlot: null,
    weaponDetail: null,
    ...overrides,
  });

  it("locks the off-hand for a two-handed main-hand weapon", () => {
    expect(isOffHandLocked([row({ equippedSlot: "MAIN_HAND", weaponDetail: { twoHanded: true } })])).toBe(true);
  });

  it("leaves the off-hand free for a one-handed main-hand weapon", () => {
    expect(isOffHandLocked([row({ equippedSlot: "MAIN_HAND", weaponDetail: { twoHanded: false } })])).toBe(false);
  });

  // Slot-scoped, not inventory-scoped: an unequipped greatsword locks nothing.
  it("ignores a two-handed weapon that is not equipped", () => {
    expect(isOffHandLocked([row({ weaponDetail: { twoHanded: true } })])).toBe(false);
  });

  it("ignores a two-handed weapon equipped somewhere other than the main hand", () => {
    expect(isOffHandLocked([row({ equippedSlot: "OFF_HAND", weaponDetail: { twoHanded: true } })])).toBe(false);
  });

  it("an empty loadout locks nothing", () => {
    expect(isOffHandLocked([])).toBe(false);
  });
});
