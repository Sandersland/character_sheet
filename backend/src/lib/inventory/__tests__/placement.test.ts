import { describe, expect, it } from "vitest";

import { allowedSlotsForItem, type PlaceableItem } from "@/lib/inventory/inventory-placement.js";

// Pure unit tests — no DB. Pins the slot-legality rule now that it is exported
// for reuse outside its defining module (#1432); the assertions mirror the
// frontend mirror's `allowedSlotsForItem` block so a divergence shows up here.

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

  // Not reachable from the wire shape the frontend mirror sees, so only this
  // suite covers it: a detail-less armor row falls to BODY rather than to the
  // shield branch, which is what keeps `applySetEquipped` from rejecting armor
  // whose detail row failed to load.
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
