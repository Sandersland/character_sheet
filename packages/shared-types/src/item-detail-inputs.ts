// Looser than the *Detail shapes the API returns: only the fields the matching *Detail table's columns are NOT NULL for; everything else defaults server-side and is refinable via an `update` operation.
// Names match the Prisma schema's ItemCategory/ArmorCategory/WeaponClass/WeaponRange enums — keep in sync.

export type ItemCategory = "weapon" | "armor" | "consumable" | "gear";
export type ArmorCategory = "light" | "medium" | "heavy" | "shield";
export type WeaponClass = "simple" | "martial";
export type WeaponRange = "melee" | "ranged";

/**
 * SRD 5.1 / SRD 5.2 both list Artisan's Tools, Gaming Set, Musical Instrument.
 * Backend's `ToolCategory` re-exports this type rather than declaring its own.
 */
export type ToolCategory = "artisan" | "gamingSet" | "musicalInstrument" | "other";

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
  weaponClass?: WeaponClass;
  weaponRange?: WeaponRange;
}

export interface ArmorDetailInput {
  armorCategory: ArmorCategory;
  baseArmorClass: number;
  dexModifierApplies?: boolean;
  dexModifierMax?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}
