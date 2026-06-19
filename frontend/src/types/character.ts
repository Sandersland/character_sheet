/**
 * Shape of character data returned by `GET /api/characters` and
 * `GET /api/characters/:id`. `level`/`proficiencyBonus`/threshold fields
 * are derived server-side from `experiencePoints` (see backend's
 * src/lib/experience.ts) and never set directly by the client.
 */

export type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export type SkillName =
  | "acrobatics"
  | "animalHandling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleightOfHand"
  | "stealth"
  | "survival";

export interface Skill {
  name: SkillName;
  ability: AbilityName;
  proficient: boolean;
  expertise?: boolean;
}

export interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

export type ItemCategory = "weapon" | "armor" | "consumable" | "gear";
export type ArmorCategory = "light" | "medium" | "heavy" | "shield";

/**
 * Weapon-specific mechanics, present (as `weapon`) only on a row whose
 * category is "weapon". Dice are decomposed (count/faces/modifier) to match
 * `lib/dice.ts`'s `RollSpec` shape rather than a "1d6" string, so a future
 * damage-roll feature reads these directly — see backend's schema.prisma
 * comment on ItemWeaponDetail.
 */
export interface WeaponDetail {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier: number;
  damageType: string; // e.g. "bludgeoning"
  /** Two-handed grip's alt die; undefined on both means not versatile. */
  versatileDiceCount?: number;
  versatileDiceFaces?: number;
  finesse: boolean;
  light: boolean;
  heavy: boolean;
  twoHanded: boolean;
  reach: boolean;
  thrown: boolean;
  ammunition: boolean;
  rangeNormal?: number;
  rangeLong?: number;
}

/** Armor-specific mechanics (shields included), present only on `category: "armor"`. */
export interface ArmorDetail {
  armorCategory: ArmorCategory;
  /** Base AC for body armor, or the flat AC bonus for a shield. */
  baseArmorClass: number;
  dexModifierApplies: boolean;
  /** Cap on the Dex modifier added to AC; undefined means uncapped (light armor). */
  dexModifierMax?: number;
  stealthDisadvantage: boolean;
  strengthRequirement?: number;
}

/**
 * A consumable's roll-based effect (e.g. a potion's "2d4 + 2" healing),
 * present only on `category: "consumable"` items that actually have one —
 * a torch wouldn't. Same RollSpec-shaped dice fields as WeaponDetail.
 */
export interface ConsumableDetail {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string; // e.g. "Restores hit points"
}

/**
 * Baseline equipment catalog served by `GET /api/items` — the "pick a
 * club, don't hand-author one" path for the inventory editor (Phase B).
 * `InventoryItem` below snapshots these fields (including `weapon`/`armor`/
 * `consumable`) rather than referencing this type live; see backend's
 * schema.prisma comment on Item/InventoryItem.
 */
export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  weight?: number;
  cost?: Currency;
  description?: string;
  weapon?: WeaponDetail;
  armor?: ArmorDetail;
  consumable?: ConsumableDetail;
}

/**
 * A character's own copy of an item's stats, optionally traced back to a
 * catalog `Item` via `itemId` (undefined means homebrew/no catalog match —
 * same nullable-FK-plus-own-fields shape as race/background selections).
 * Every field below — including `weapon`/`armor`/`consumable`, at most one
 * of which is present, matching `category` — is this row's own value, free
 * to diverge from the catalog (e.g. renaming "Club" to "Club +1" and
 * bumping its own `weapon.damageModifier` after a magic bonus).
 */
export interface InventoryItem {
  id: string;
  itemId?: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  weight?: number;
  cost?: Currency;
  description?: string;
  equipped: boolean;
  notes?: string;
  weapon?: WeaponDetail;
  armor?: ArmorDetail;
  consumable?: ConsumableDetail;
}

// Looser than WeaponDetail/ArmorDetail above (which describe what the API
// always returns, every flag included) — these describe what a client only
// has to *send*: just the fields the matching *Detail table's columns are
// NOT NULL for, matching backend's lib/inventory.ts WeaponDetailInput/
// ArmorDetailInput exactly. Everything else defaults server-side and is
// refinable later via an `update` operation.
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
}

export interface ArmorDetailInput {
  armorCategory: ArmorCategory;
  baseArmorClass: number;
  dexModifierApplies?: boolean;
  dexModifierMax?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}

/**
 * Body for a custom (homebrew) `acquire` operation — same shape as `Item`
 * minus `id`, plus the category's required minimal detail block (backend's
 * routes/inventory.ts rejects e.g. a "weapon" with no `weapon` block, since
 * those columns are NOT NULL). Matches backend's lib/inventory.ts
 * CustomItemInput.
 */
export type CustomItemInput =
  | {
      name: string;
      category: "weapon";
      weight?: number;
      cost?: Currency;
      description?: string;
      weapon: WeaponDetailInput;
    }
  | {
      name: string;
      category: "armor";
      weight?: number;
      cost?: Currency;
      description?: string;
      armor: ArmorDetailInput;
    }
  | {
      name: string;
      category: "consumable";
      weight?: number;
      cost?: Currency;
      description?: string;
      consumable?: ConsumableDetail;
    }
  | { name: string; category: "gear"; weight?: number; cost?: Currency; description?: string };

/**
 * One operation in a `POST /api/characters/:id/inventory/transactions`
 * batch — see backend's lib/inventory.ts for the full semantics (which ops
 * get logged to the ledger, atomicity, etc). A request batches 1+ of these.
 */
export type InventoryOperation =
  | {
      type: "acquire";
      itemId?: string;
      custom?: CustomItemInput;
      quantity?: number;
      equipped?: boolean;
      notes?: string;
      currencyDelta?: Currency;
    }
  | { type: "adjustQuantity"; inventoryItemId: string; delta: number }
  | {
      type: "update";
      inventoryItemId: string;
      name?: string;
      notes?: string | null;
      equipped?: boolean;
      weight?: number;
      cost?: Currency;
      description?: string;
      weapon?: Partial<WeaponDetail>;
      armor?: Partial<ArmorDetail>;
      consumable?: Partial<ConsumableDetail>;
    }
  | { type: "remove"; inventoryItemId: string }
  | { type: "sell"; inventoryItemId: string; quantity?: number; currencyDelta: Currency };

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

export interface Spell {
  id: string;
  name: string;
  level: number; // 0 = cantrip
  school: SpellSchool;
  prepared?: boolean;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
}

export interface SpellSlots {
  level: number;
  total: number;
  used: number;
}

export interface JournalEntry {
  id: string;
  title: string;
  date: string;
  body: string;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  subclass?: string;
  level: number;
  experiencePoints: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number | null;
  background: string;
  alignment: string;
  portraitUrl?: string;

  armorClass: number;
  initiativeBonus: number;
  speed: number;
  proficiencyBonus: number;

  hitPoints: {
    current: number;
    max: number;
    temp: number;
  };
  hitDice: {
    total: number;
    die: string; // e.g. "d10"
  };

  abilityScores: AbilityScores;
  savingThrowProficiencies: AbilityName[];
  skills: Skill[];

  inventory: InventoryItem[];
  currency: Currency;

  spellcasting?: {
    ability: AbilityName;
    spellSaveDC: number;
    spellAttackBonus: number;
    slots: SpellSlots[];
    spells: Spell[];
  };

  journal: JournalEntry[];
}

export interface CharacterSummary {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  portraitUrl?: string;
}

/**
 * Baseline catalog entries served by `GET /api/reference`, used to populate
 * the character-creation form. These are *suggestions* the backend can
 * derive mechanics from — a created character's race/class/background name
 * can still drift from (or omit) a catalog match; see backend's
 * schema.prisma for the reasoning.
 */
export interface RaceOption {
  id: string;
  name: string;
  speed: number;
}

export interface ClassOption {
  id: string;
  name: string;
  hitDie: string;
  savingThrows: AbilityName[];
  skillChoiceCount: number;
  skillChoices: SkillName[];
  isSpellcaster: boolean;
}

export interface BackgroundOption {
  id: string;
  name: string;
  skillProficiencies: SkillName[];
}

export interface ReferenceData {
  races: RaceOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  alignments: string[];
}

/** Body for `POST /api/characters`. The backend derives AC/HP/saves/skills
 * from `race`/`classes[0]`/`abilityScores` — see backend's
 * src/lib/srd.ts — rather than the client computing and sending them. */
export interface CreateCharacterInput {
  name: string;
  alignment: string;
  portraitUrl?: string | null;
  experiencePoints?: number;
  race: string;
  background: string;
  classes: [{ name: string; subclass?: string | null }];
  abilityScores: AbilityScores;
  skillProficiencies?: SkillName[];
}
