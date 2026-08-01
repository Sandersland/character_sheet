// Starting-equipment wire types (#1273) — de-duplicates the declarations that
// were hand-mirrored between the backend's (since-deleted) STARTING_EQUIPMENT
// module and frontend/src/types/character/reference.ts. These types are now
// ALSO the wire contract for the DB-backed choice-group schema
// (StartingEquipmentPackage/Group/Option/Item/OpenPick, #1519/#1533/#1534):
// mapStartingEquipmentPackage (backend lib/inventory/starting-equipment-package.ts)
// maps rows onto exactly this shape. The frontend receives a package per class
// from GET /api/reference; pack expansion runs server-side at character
// creation from the DB-backed packs.

import type { ToolCategory, WeaponClass, WeaponRange } from "./item-detail-inputs.js";

/**
 * Filter used for open picks — omitting a field means "any" on that axis.
 * Renamed from WeaponPoolFilter (#1564): it now also filters the tool/
 * instrument pool (`toolCategory`), not only weapons. weaponClass/range and
 * toolCategory are mutually exclusive in practice — a pick is either
 * weapon-shaped or tool-shaped, never both.
 */
export interface OpenPickFilter {
  weaponClass?: WeaponClass;
  range?: WeaponRange;
  toolCategory?: ToolCategory;
}

/** Reference to a concrete catalog Item by its unique name, with a quantity. */
export interface FixedItemRef {
  catalogName: string;
  quantity?: number; // default 1
}

/**
 * An open pick from a filtered catalog pool, e.g. "any martial weapon" or
 * "musical instrument of your choice" (#1564). `boundToToolChoice: true`
 * means this isn't a free pick at all — the chosen item must be one of the
 * character's own creation tool choices (Monk's "Artisan's Tools or Musical
 * Instrument chosen for the tool proficiency above"; omitted when false).
 */
export interface OpenPick {
  label: string;
  filter: OpenPickFilter;
  quantity?: number; // default 1
  boundToToolChoice?: boolean;
}

/**
 * One selectable bundle within a choice group — a set of fixed items plus
 * zero or more open picks the player fills in from the filtered catalog, and/
 * or a flat GP amount (PHB'24: every non-final option carries GP, and the
 * final flat-gold option is just an option with `gold` set and no items).
 * Omitted (not 0) when the option grants none — every 2014 option.
 */
export interface EquipmentBundle {
  label: string;
  items?: FixedItemRef[];
  openPicks?: OpenPick[];
  gold?: number;
}

/**
 * A choice group within a class's starting equipment.
 * options.length === 1 → auto-granted (no player choice needed).
 * options.length > 1  → player picks exactly one bundle.
 */
export interface EquipmentChoiceGroup {
  label: string;
  options: EquipmentBundle[];
}

/** Dice expression for starting gold: roll diceCount×dFaces, multiply. */
export interface StartingGold {
  diceCount: number;
  diceFaces: number;
  multiplier: number;
}

export interface ClassStartingEquipment {
  groups: EquipmentChoiceGroup[];
  // NULL = this edition has no roll-for-gold alternative at all (PHB'24 —
  // its gold is reached through a lettered EquipmentBundle.gold option
  // instead, #1564). Every EDITION_2014 package keeps a real StartingGold.
  gold: StartingGold | null;
}
