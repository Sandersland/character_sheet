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
export type WeaponClass = "simple" | "martial";
export type WeaponRange = "melee" | "ranged";

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
  /** Proficiency group; undefined for homebrew weapons that weren't classified. */
  weaponClass?: WeaponClass;
  /** Melee vs. ranged; undefined for unclassified homebrew weapons. */
  weaponRange?: WeaponRange;
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

export type LedgerEntryType = "acquired" | "consumed" | "sold" | "bought" | "removed";

/**
 * One row from `GET /api/characters/:id/inventory/transactions` — the
 * read-only inventory ledger. Shape is unchanged from before the unified
 * CharacterEvent table migration; the backend maps CharacterEvent fields back
 * to this shape so LedgerModal keeps working.
 */
export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  quantityDelta: number;
  currencyDelta?: Currency;
  itemName: string;
  inventoryItemId?: string;
  note?: string;
  batchId?: string;
  createdAt: string;
}

// ── Unified activity timeline ─────────────────────────────────────────────────

export type CharacterEventCategory =
  | "inventory"
  | "hitPoints"
  | "experience"
  | "currency"
  | "spellcasting"
  | "class"
  | "resources";

export type CharacterEventType =
  | "acquired" | "consumed" | "sold" | "bought" | "removed"  // inventory
  | "damage" | "heal" | "setTemp" | "shortRest" | "longRest" // hitPoints
  | "levelUp" | "levelDown" | "deathSave" | "stabilize"      // hitPoints (cont.)
  | "xpAward" | "xpSet"                                       // experience
  | "currencyAdjust"                                           // currency
  | "castSpell" | "expendSlot" | "restoreSlot"                // spellcasting
  | "learnSpell" | "forgetSpell" | "prepareSpell" | "unprepareSpell" // spellcasting (cont.)
  | "subclassChosen"                                           // class
  | "spendResource" | "restoreResource"                       // resources
  | "learnManeuver" | "forgetManeuver"                        // resources (cont.)
  | "revert";                                                  // meta

export interface CharacterEventField {
  id: string;
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * One row from `GET /api/characters/:id/activity` — the unified event log
 * that covers all domains (inventory, HP, XP, currency) in a single
 * chronological stream. `summary` is a human-readable snapshot rendered
 * at write time. `before`/`after` carry the affected sub-state for field
 * diffs and undo. `fields` is included only when `?includeFields=1`.
 */
export interface CharacterEvent {
  id: string;
  category: CharacterEventCategory;
  type: CharacterEventType;
  summary: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  data?: unknown;
  actor: string;
  reverted: boolean;
  batchId?: string;
  createdAt: string;
  fields?: CharacterEventField[];
}

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

/**
 * A spell entry in the character's spellcasting JSON (per-character mutable
 * state). `id` is the per-character entry UUID (operation target); `spellId`
 * is the optional catalog `Spell.id` provenance pointer (null for custom spells).
 * Effect fields are snapshotted from the catalog at learn time so they can be
 * used for auto-rolling without a live catalog join.
 */
export interface Spell {
  id: string;
  spellId?: string;   // catalog Spell.id provenance — undefined for custom spells
  name: string;
  level: number; // 0 = cantrip
  school: SpellSchool;
  prepared?: boolean;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  // Structured effect for auto-rolling at cast time (RollSpec-shaped):
  effectKind?: "damage" | "heal" | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: "attack" | "save" | null;
  saveAbility?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
}

/**
 * Baseline catalog entry served by `GET /api/spells` — the "pick a spell
 * from the SRD" path for the spellbook editor. Mirrors the `Spell` interface
 * but without per-character fields (id here is the catalog id, not an entry id;
 * `prepared` is absent since preparation is a per-character state).
 */
export interface CatalogSpell {
  id: string;       // catalog Spell.id (used as learnSpell.spellId)
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  upcastDicePerLevel?: number;
  cantripScaling: boolean;
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

// ── Class feature types ───────────────────────────────────────────────────────

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

export interface ResourcePool {
  key: string;
  label: string;
  total: number;
  die?: string;        // e.g. "d8"
  recharge: RechargeOn;
  description?: string;
  used: number;
  remaining: number;
}

export interface ClassFeature {
  name: string;
  level: number;
  description: string;
  source: "class" | "subclass";
}

/** A known maneuver entry on a character — per-character entry with catalog provenance. */
export interface ManeuverEntry {
  id: string;
  maneuverId?: string;   // catalog Maneuver.id provenance — undefined for custom
  name: string;
  description: string;
}

/** Catalog maneuver served by GET /api/maneuvers. */
export interface CatalogManeuver {
  id: string;
  name: string;
  description: string;
}

/** Derived class/subclass resource data merged with stored mutable state. */
export interface CharacterResources {
  features: ClassFeature[];
  maneuverChoiceCount?: number;
  maneuverSaveDC?: number;
  pools: ResourcePool[];
  maneuversKnown: ManeuverEntry[];
}

/** One entry in `Character.classes` — structured multiclass-aware view. */
export interface ClassEntry {
  name: string;
  level: number;
  subclass?: string;
  subclassId?: string;
  classId?: string;
}

// ── Subclass option (from GET /api/reference) ─────────────────────────────────

export interface SubclassOption {
  id: string;
  name: string;
  description: string;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  subclass?: string;
  subclassId?: string;
  level: number;
  experiencePoints: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number | null;
  /** Number of level-ups pending (XP-derived level exceeds applied hitDice.total). */
  pendingLevelUps: number;
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
    deathSaves: { successes: number; failures: number };
  };
  hitDice: {
    total: number;
    die: string; // e.g. "d10"
    spent: number;
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

  resources?: CharacterResources;

  classes?: ClassEntry[];

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

// ── Starting equipment types (mirrors backend/src/lib/srd.ts) ──────────────
// The frontend receives these from GET /api/reference (attached to each
// ClassOption) and never needs to hardcode them itself.

export interface WeaponPoolFilter {
  weaponClass?: WeaponClass;
  range?: WeaponRange;
}

export interface FixedItemRef {
  catalogName: string;
  quantity?: number;
}

export interface OpenWeaponPick {
  label: string;
  filter: WeaponPoolFilter;
  quantity?: number;
}

export interface EquipmentBundle {
  label: string;
  items?: FixedItemRef[];
  openPicks?: OpenWeaponPick[];
}

export interface EquipmentChoiceGroup {
  label: string;
  options: EquipmentBundle[];
}

export interface StartingGold {
  diceCount: number;
  diceFaces: number;
  multiplier: number;
}

export interface ClassStartingEquipment {
  groups: EquipmentChoiceGroup[];
  gold: StartingGold;
}

// ── Reference types ─────────────────────────────────────────────────────────

export interface ClassOption {
  id: string;
  name: string;
  hitDie: string;
  savingThrows: AbilityName[];
  skillChoiceCount: number;
  skillChoices: SkillName[];
  isSpellcaster: boolean;
  /** Character level at which this class grants a subclass (1, 2, or 3). */
  subclassLevel: number;
  /** Available subclasses for this class, ordered alphabetically. */
  subclasses: SubclassOption[];
  /** Starting equipment definition, null if the class has no package defined. */
  startingEquipment: ClassStartingEquipment | null;
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
// One selection per equipment choice group when mode:"package".
export interface PackageSelection {
  optionIndex: number;
  openPicks?: string[]; // catalog item names, in the bundle's openPick order
}

export type StartingEquipmentInput =
  | { mode: "package"; selections: PackageSelection[] }
  | { mode: "gold"; gold: number };

export interface CreateCharacterInput {
  name: string;
  alignment: string;
  portraitUrl?: string | null;
  experiencePoints?: number;
  race: string;
  background: string;
  classes: [{ name: string; subclass?: string | null; subclassId?: string }];
  abilityScores: AbilityScores;
  skillProficiencies?: SkillName[];
  startingEquipment?: StartingEquipmentInput;
}

// ── Spellcasting operation types (mirrors backend/src/lib/spellcasting.ts) ───
// Sent as `{ operations: SpellcastingOperation[] }` to
// POST /api/characters/:id/spellcasting/transactions.

/** Custom spell input for learnSpell without a catalog entry. */
export interface CustomSpellInput {
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  upcastDicePerLevel?: number;
  cantripScaling?: boolean;
}

/** Cast a spell: expend slot (if leveled), send client-computed roll total. */
export interface CastSpellOperation { type: "castSpell"; entryId: string; slotLevel?: number; roll: number }
/** Bare slot expenditure (no specific spell). */
export interface ExpendSlotOperation { type: "expendSlot"; level: number }
/** Restore one previously-expended slot (undo mis-click). */
export interface RestoreSlotOperation { type: "restoreSlot"; level: number }
/** Learn a spell from catalog (spellId) or custom payload. */
export interface LearnSpellOperation { type: "learnSpell"; spellId?: string; custom?: CustomSpellInput }
/** Remove a spell from the spellbook by its per-character entry id. */
export interface ForgetSpellOperation { type: "forgetSpell"; entryId: string }
/** Mark a non-cantrip as prepared. */
export interface PrepareSpellOperation { type: "prepareSpell"; entryId: string }
/** Mark a non-cantrip as unprepared. */
export interface UnprepareSpellOperation { type: "unprepareSpell"; entryId: string }

export type SpellcastingOperation =
  | CastSpellOperation
  | ExpendSlotOperation
  | RestoreSlotOperation
  | LearnSpellOperation
  | ForgetSpellOperation
  | PrepareSpellOperation
  | UnprepareSpellOperation;

// ── Class operation types (mirrors backend/src/lib/class.ts) ─────────────────
// Sent as `{ operations: ClassOperation[] }` to POST /api/characters/:id/class/transactions.

export interface SetSubclassOperation { type: "setSubclass"; subclassId: string }
export type ClassOperation = SetSubclassOperation;

// ── Resource operation types (mirrors backend/src/lib/resources.ts) ──────────
// Sent as `{ operations: ResourceOperation[] }` to POST /api/characters/:id/resources/transactions.

export interface SpendResourceOperation { type: "spendResource"; key: string; amount?: number; roll?: number }
export interface RestoreResourceOperation { type: "restoreResource"; key: string; amount?: number }
export interface LearnManeuverOperation { type: "learnManeuver"; maneuverId?: string; custom?: { name: string; description: string } }
export interface ForgetManeuverOperation { type: "forgetManeuver"; entryId: string }
export type ResourceOperation =
  | SpendResourceOperation
  | RestoreResourceOperation
  | LearnManeuverOperation
  | ForgetManeuverOperation;

// ── XP operation types (mirrors backend/src/lib/experience-ops.ts) ──────────
// Sent as `{ operations: ExperienceOperation[] }` to POST /api/characters/:id/experience.

/** Award or deduct XP by a signed delta. */
export interface XpAwardOperation { type: "award"; amount: number }
/** Set total XP to an exact value. */
export interface XpSetOperation { type: "set"; value: number }
export type ExperienceOperation = XpAwardOperation | XpSetOperation;

// ── HP operation types (mirrors backend/src/lib/hitpoints.ts) ───────────────
// Sent as `{ operations: HitPointOperation[] }` to POST /api/characters/:id/hp.

export interface DamageOperation { type: "damage"; amount: number }
export interface HealOperation { type: "heal"; amount: number }
export interface SetTempOperation { type: "setTemp"; amount: number }
/** `rolls`: one raw die value per hit die spent (rolled by the client via dice.ts). */
export interface ShortRestOperation { type: "shortRest"; rolls: number[] }
export interface LongRestOperation { type: "longRest" }
/** For "roll": client rolls via dice.ts, sends the raw die face as `roll`. */
export interface LevelUpOperation { type: "levelUp"; method: "average" | "roll"; roll?: number }
/** Client rolls d20 via dice.ts, sends the raw value. Only valid at 0 HP. */
export interface DeathSaveOperation { type: "deathSave"; roll: number }
export interface StabilizeOperation { type: "stabilize" }

export type HitPointOperation =
  | DamageOperation
  | HealOperation
  | SetTempOperation
  | ShortRestOperation
  | LongRestOperation
  | LevelUpOperation
  | DeathSaveOperation
  | StabilizeOperation;
