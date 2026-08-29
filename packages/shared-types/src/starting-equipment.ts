// Wire contract for the DB-backed choice-group schema, mapped onto this shape by `mapStartingEquipmentPackage`.
// The frontend receives one package per class from GET /api/reference; pack expansion runs server-side at character creation.

import type { ToolCategory, WeaponClass, WeaponRange } from "./item-detail-inputs.js";

/** Omitting a field means "any" on that axis; weaponClass/range and toolCategory are mutually exclusive — a pick is weapon-shaped or tool-shaped, never both. */
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

/** `boundToToolChoice: true` means the chosen item must match one of the character's own creation tool choices (e.g. Monk's tool-or-instrument pick), not a free pick from the catalog. */
export interface OpenPick {
  label: string;
  filter: OpenPickFilter;
  quantity?: number; // default 1
  boundToToolChoice?: boolean;
}

export interface EquipmentBundle {
  label: string;
  items?: FixedItemRef[];
  openPicks?: OpenPick[];
  /**
   * PHB'24: every non-final option carries GP, and the final flat-gold option
   * is just an option with `gold` set and no items. Omitted (not 0) when the
   * option grants none — true for every 2014 option.
   */
  gold?: number;
}

/** options.length === 1 → auto-granted (no player choice needed); options.length > 1 → player picks exactly one bundle. */
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
  // NULL means this edition has no roll-for-gold alternative (PHB'24 reaches gold through a lettered EquipmentBundle.gold option instead); every EDITION_2014 package keeps a real StartingGold.
  gold: StartingGold | null;
}
