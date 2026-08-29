import type { ArmorCategory, WeaponClass, WeaponRange } from "@/generated/prisma/client.js";

// The one field-copy builder shared by every "snapshot one detail row into another" call site: catalog-acquire and campaign-award use snapshotDetailCreate's nested Prisma create block; snapshotInventoryItemForUndo uses the flat per-detail builders directly, unwrapped.

export interface WeaponDetailFields {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier: number;
  damageType: string;
  versatileDiceCount: number | null;
  versatileDiceFaces: number | null;
  finesse: boolean;
  light: boolean;
  heavy: boolean;
  twoHanded: boolean;
  reach: boolean;
  thrown: boolean;
  ammunition: boolean;
  rangeNormal: number | null;
  rangeLong: number | null;
  weaponClass: WeaponClass | null;
  weaponRange: WeaponRange | null;
}

export interface ArmorDetailFields {
  armorCategory: ArmorCategory;
  baseArmorClass: number;
  dexModifierApplies: boolean;
  dexModifierMax: number | null;
  stealthDisadvantage: boolean;
  strengthRequirement: number | null;
}

export interface ConsumableDetailFields {
  effectDiceCount: number | null;
  effectDiceFaces: number | null;
  effectModifier: number | null;
  effectDescription: string | null;
  maxUses: number | null;
  usesRemaining: number | null;
}

export function weaponDetailFields(detail: WeaponDetailFields): WeaponDetailFields {
  return {
    damageDiceCount: detail.damageDiceCount,
    damageDiceFaces: detail.damageDiceFaces,
    damageModifier: detail.damageModifier,
    damageType: detail.damageType,
    versatileDiceCount: detail.versatileDiceCount,
    versatileDiceFaces: detail.versatileDiceFaces,
    finesse: detail.finesse,
    light: detail.light,
    heavy: detail.heavy,
    twoHanded: detail.twoHanded,
    reach: detail.reach,
    thrown: detail.thrown,
    ammunition: detail.ammunition,
    rangeNormal: detail.rangeNormal,
    rangeLong: detail.rangeLong,
    weaponClass: detail.weaponClass,
    weaponRange: detail.weaponRange,
  };
}

export function armorDetailFields(detail: ArmorDetailFields): ArmorDetailFields {
  return {
    armorCategory: detail.armorCategory,
    baseArmorClass: detail.baseArmorClass,
    dexModifierApplies: detail.dexModifierApplies,
    dexModifierMax: detail.dexModifierMax,
    stealthDisadvantage: detail.stealthDisadvantage,
    strengthRequirement: detail.strengthRequirement,
  };
}

// #121: freshCopy defaults usesRemaining to maxUses ("a newly gained copy starts full"); undo-restore omits opts to get the verbatim value instead.
export function consumableDetailFields(
  detail: ConsumableDetailFields,
  opts: { freshCopy?: boolean } = {},
): ConsumableDetailFields {
  return {
    effectDiceCount: detail.effectDiceCount,
    effectDiceFaces: detail.effectDiceFaces,
    effectModifier: detail.effectModifier,
    effectDescription: detail.effectDescription,
    maxUses: detail.maxUses,
    usesRemaining: opts.freshCopy ? (detail.usesRemaining ?? detail.maxUses) : detail.usesRemaining,
  };
}

export interface DetailSnapshotSource {
  weaponDetail: WeaponDetailFields | null;
  armorDetail: ArmorDetailFields | null;
  consumableDetail: ConsumableDetailFields | null;
}

// Shared by the catalog-acquire and campaign-award paths — both are "gain a fresh copy" semantics, so the consumable detail always tops up to maxUses.
export function snapshotDetailCreate(source: DetailSnapshotSource) {
  return {
    weaponDetail: source.weaponDetail ? { create: weaponDetailFields(source.weaponDetail) } : undefined,
    armorDetail: source.armorDetail ? { create: armorDetailFields(source.armorDetail) } : undefined,
    consumableDetail: source.consumableDetail
      ? { create: consumableDetailFields(source.consumableDetail, { freshCopy: true }) }
      : undefined,
  };
}
