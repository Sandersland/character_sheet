import { describe, expect, it } from "vitest";

import {
  armorDetailFields,
  consumableDetailFields,
  snapshotDetailCreate,
  weaponDetailFields,
  type ArmorDetailFields,
  type ConsumableDetailFields,
  type WeaponDetailFields,
} from "@/lib/detail-snapshot.js";

// Pure unit tests — no DB. Covers the field-copy builders shared by the
// catalog-acquire, campaign-award, and undo-restore snapshot sites.

const weapon: WeaponDetailFields = {
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageModifier: 0,
  damageType: "slashing",
  versatileDiceCount: 1,
  versatileDiceFaces: 10,
  finesse: false,
  light: false,
  heavy: false,
  twoHanded: false,
  reach: false,
  thrown: false,
  ammunition: false,
  rangeNormal: null,
  rangeLong: null,
  weaponClass: "martial",
  weaponRange: "melee",
};

const armor: ArmorDetailFields = {
  armorCategory: "medium",
  baseArmorClass: 14,
  dexModifierApplies: true,
  dexModifierMax: 2,
  stealthDisadvantage: false,
  strengthRequirement: null,
};

const consumable: ConsumableDetailFields = {
  effectDiceCount: 2,
  effectDiceFaces: 4,
  effectModifier: 2,
  effectDescription: "Restores hit points",
  maxUses: 3,
  usesRemaining: 1,
};

describe("weaponDetailFields", () => {
  it("copies every mechanical field verbatim", () => {
    expect(weaponDetailFields(weapon)).toEqual(weapon);
  });

  it("preserves null range/versatile fields (non-versatile, non-thrown weapon)", () => {
    const dagger: WeaponDetailFields = { ...weapon, versatileDiceCount: null, versatileDiceFaces: null };
    expect(weaponDetailFields(dagger).versatileDiceCount).toBeNull();
    expect(weaponDetailFields(dagger).versatileDiceFaces).toBeNull();
  });
});

describe("armorDetailFields", () => {
  it("copies every mechanical field verbatim", () => {
    expect(armorDetailFields(armor)).toEqual(armor);
  });

  it("preserves a null strengthRequirement (light armor)", () => {
    expect(armorDetailFields(armor).strengthRequirement).toBeNull();
  });
});

describe("consumableDetailFields", () => {
  it("copies fields verbatim (freshCopy omitted) — undo-restore semantics", () => {
    expect(consumableDetailFields(consumable)).toEqual(consumable);
  });

  it("freshCopy defaults usesRemaining to maxUses when null (never-set charge)", () => {
    const uncharged = { ...consumable, usesRemaining: null };
    expect(consumableDetailFields(uncharged, { freshCopy: true }).usesRemaining).toBe(3);
  });

  it("freshCopy leaves an already-set usesRemaining untouched, even below maxUses", () => {
    expect(consumableDetailFields(consumable, { freshCopy: true }).usesRemaining).toBe(1);
  });

  it("freshCopy leaves an already-full usesRemaining untouched", () => {
    const full = { ...consumable, usesRemaining: 3 };
    expect(consumableDetailFields(full, { freshCopy: true }).usesRemaining).toBe(3);
  });

  it("a stackable (non-charged) consumable stays null for both maxUses and usesRemaining", () => {
    const stackable: ConsumableDetailFields = {
      effectDiceCount: null,
      effectDiceFaces: null,
      effectModifier: null,
      effectDescription: null,
      maxUses: null,
      usesRemaining: null,
    };
    expect(consumableDetailFields(stackable, { freshCopy: true }).usesRemaining).toBeNull();
  });
});

describe("snapshotDetailCreate", () => {
  it("wraps each present detail in a nested Prisma create block", () => {
    const result = snapshotDetailCreate({ weaponDetail: weapon, armorDetail: null, consumableDetail: null });
    expect(result.weaponDetail).toEqual({ create: weapon });
    expect(result.armorDetail).toBeUndefined();
    expect(result.consumableDetail).toBeUndefined();
  });

  it("omits absent detail kinds as undefined (not null) — matches Prisma's optional nested-create shape", () => {
    const result = snapshotDetailCreate({ weaponDetail: null, armorDetail: null, consumableDetail: null });
    expect(result).toEqual({ weaponDetail: undefined, armorDetail: undefined, consumableDetail: undefined });
  });

  it("tops up a never-set (null) usesRemaining to maxUses (fresh-copy semantics)", () => {
    const result = snapshotDetailCreate({
      weaponDetail: null,
      armorDetail: null,
      consumableDetail: { ...consumable, usesRemaining: null },
    });
    expect(result.consumableDetail).toEqual({ create: { ...consumable, usesRemaining: 3 } });
  });

  it("preserves an already-set usesRemaining (including 0) rather than topping it up — `??` only defaults null/undefined", () => {
    const result = snapshotDetailCreate({
      weaponDetail: null,
      armorDetail: null,
      consumableDetail: { ...consumable, usesRemaining: 0 },
    });
    expect(result.consumableDetail).toEqual({ create: { ...consumable, usesRemaining: 0 } });
  });

  it("handles all three details present at once", () => {
    const result = snapshotDetailCreate({ weaponDetail: weapon, armorDetail: armor, consumableDetail: consumable });
    expect(result.weaponDetail).toEqual({ create: weapon });
    expect(result.armorDetail).toEqual({ create: armor });
    expect(result.consumableDetail).toEqual({ create: consumable });
  });
});
