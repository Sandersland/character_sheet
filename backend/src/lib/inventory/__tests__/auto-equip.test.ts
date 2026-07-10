import { describe, expect, it } from "vitest";

import { selectAutoEquip, type AutoEquipCandidate } from "@/lib/inventory/inventory.js";

// Pure unit tests — no DB. selectAutoEquip decides which starting-equipment
// InventoryItem create payloads get `equipped: true` on character creation.

function weapon(position: number, opts: { twoHanded?: boolean } = {}): AutoEquipCandidate {
  return {
    category: "weapon",
    position,
    weaponDetail: { create: { twoHanded: opts.twoHanded ?? false } },
  };
}

function armor(
  position: number,
  armorCategory: "light" | "medium" | "heavy" | "shield",
): AutoEquipCandidate {
  return {
    category: "armor",
    position,
    armorDetail: { create: { armorCategory } },
  };
}

function gear(position: number): AutoEquipCandidate {
  return { category: "gear", position };
}

describe("selectAutoEquip", () => {
  it("equips a one-handed weapon and a shield together", () => {
    const items = [weapon(0), armor(1, "shield")];
    expect(selectAutoEquip(items).sort()).toEqual([0, 1]);
  });

  it("equips a two-handed weapon alone — no shield", () => {
    const items = [weapon(0, { twoHanded: true }), armor(1, "shield")];
    expect(selectAutoEquip(items)).toEqual([0]);
  });

  it("equips body armor regardless of weapon grip", () => {
    const items = [weapon(0, { twoHanded: true }), armor(1, "heavy")];
    expect(selectAutoEquip(items).sort()).toEqual([0, 1]);
  });

  it("equips body armor + shield with a one-handed weapon", () => {
    const items = [weapon(0), armor(1, "medium"), armor(2, "shield")];
    expect(selectAutoEquip(items).sort()).toEqual([0, 1, 2]);
  });

  it("equips only the first weapon when several are present", () => {
    const items = [weapon(0), weapon(1), weapon(2)];
    expect(selectAutoEquip(items)).toEqual([0]);
  });

  it("picks the lowest-position weapon as primary even when out of order", () => {
    const items = [weapon(5), weapon(2), weapon(8)];
    expect(selectAutoEquip(items)).toEqual([1]);
  });

  it("equips at most one shield", () => {
    const items = [weapon(0), armor(1, "shield"), armor(2, "shield")];
    expect(selectAutoEquip(items).sort()).toEqual([0, 1]);
  });

  it("returns nothing equippable for gear-only inventory", () => {
    const items = [gear(0), gear(1)];
    expect(selectAutoEquip(items)).toEqual([]);
  });

  it("equips body armor with no weapon present", () => {
    const items = [armor(0, "light"), armor(1, "shield")];
    expect(selectAutoEquip(items).sort()).toEqual([0, 1]);
  });
});
