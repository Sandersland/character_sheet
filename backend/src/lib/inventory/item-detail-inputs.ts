// Single source for the weapon/armor/consumable detail-input shapes shared
// by the runtime lib (lib/inventory/inventory.ts) and the catalog seed
// (prisma/seed/catalog-data.ts). Types-only leaf, zero imports, so the seed's
// tsx context resolves it via a plain relative path. Each object is used
// directly as an Item's nested detail create, so a *Detail table's stats are
// typed in exactly one place.

// Match the Prisma schema's ItemCategory/ArmorCategory enums.
export type ItemCategoryName = "weapon" | "armor" | "consumable" | "gear";
export type ArmorCategoryName = "light" | "medium" | "heavy" | "shield";

// Mirrors ItemWeaponDetail's own fields (minus id/itemId). Dice are
// count/faces/modifier (matching frontend dice RollSpec), not a "1d6" string —
// see schema.prisma's comment on ItemWeaponDetail for why.
export interface WeaponDetailInput {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier?: number;
  damageType: string;
  versatileDiceCount?: number;
  versatileDiceFaces?: number;
  finesse?: boolean;
  light?: boolean;
  heavy?: boolean;
  twoHanded?: boolean;
  reach?: boolean;
  thrown?: boolean;
  ammunition?: boolean;
  rangeNormal?: number;
  rangeLong?: number;
  weaponClass?: "simple" | "martial";
  weaponRange?: "melee" | "ranged";
}

export interface ArmorDetailInput {
  armorCategory: ArmorCategoryName;
  baseArmorClass: number;
  dexModifierApplies?: boolean;
  dexModifierMax?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}

export interface ConsumableDetailInput {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
  maxUses?: number;
  usesRemaining?: number;
}
