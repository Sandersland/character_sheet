// Weapon/armor detail-input wire types (#1273) — de-duplicates the declarations
// that were hand-mirrored between the backend's item-detail-inputs leaf (read by
// both the runtime inventory lib and the catalog seed) and
// frontend/src/types/character/inventory.ts. Looser than the *Detail shapes the
// API returns: these are only what a client has to *send* — the fields the
// matching *Detail table's columns are NOT NULL for. Everything else defaults
// server-side and is refinable via an `update` operation.
//
// The names match the Prisma schema's ItemCategory/ArmorCategory/WeaponClass/
// WeaponRange enums but are spelled out: this package has no Prisma dependency.

export type ItemCategory = "weapon" | "armor" | "consumable" | "gear";
export type ArmorCategory = "light" | "medium" | "heavy" | "shield";
export type WeaponClass = "simple" | "martial";
export type WeaponRange = "melee" | "ranged";

// Tool-proficiency category (PHB p.154). Mirrors backend lib/srd/tools.ts's
// ToolCategory (which re-exports this rather than declaring its own, #1564)
// and Item.toolCategory / StartingEquipmentOpenPick.toolCategory — set only
// for the small set of Item rows that are actual tools.
export type ToolCategory = "artisan" | "gamingSet" | "musicalInstrument" | "other";

// Dice are count/faces/modifier (matching the frontend dice RollSpec), not a
// "1d6" string — see schema.prisma's comment on ItemWeaponDetail for why.
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
