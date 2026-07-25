// Starting-equipment wire types (#1273) — de-duplicates the declarations that
// were hand-mirrored between the backend's STARTING_EQUIPMENT module and
// frontend/src/types/character/reference.ts. The nested choice-group / open-pick
// structure stays TS-shaped rather than DB-shaped: pack contents already migrated
// to the Pack/PackContent tables, but the choice-group schema isn't worth
// designing yet. The frontend receives a package per class from GET /api/reference;
// pack expansion runs server-side at character creation from the DB-backed packs.

import type { WeaponClass, WeaponRange } from "./item-detail-inputs.js";

/** Filter used for open picks — omitting a field means "any". */
export interface WeaponPoolFilter {
  weaponClass?: WeaponClass;
  range?: WeaponRange;
}

/** Reference to a concrete catalog Item by its unique name, with a quantity. */
export interface FixedItemRef {
  catalogName: string;
  quantity?: number; // default 1
}

/** An open pick from the weapon pool, e.g. "any martial weapon". */
export interface OpenWeaponPick {
  label: string;
  filter: WeaponPoolFilter;
  quantity?: number; // default 1
}

/**
 * One selectable bundle within a choice group — a set of fixed items plus
 * zero or more open picks the player fills in from the filtered catalog.
 */
export interface EquipmentBundle {
  label: string;
  items?: FixedItemRef[];
  openPicks?: OpenWeaponPick[];
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
  gold: StartingGold;
}
