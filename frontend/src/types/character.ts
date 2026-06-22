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
  /**
   * Attack bonus = ability modifier (STR/DEX/finesse-best) + proficiency bonus
   * if proficient. Derived server-side in `serializeCharacter` — never persisted.
   * Present on `InventoryItem.weapon`; absent on catalog `Item.weapon`.
   */
  attackBonus?: number;
  /**
   * Derived damage roll spec — grip-resolved at read time by `deriveWeaponDamage`
   * in `srd.ts`. Encodes the correct die for versatile weapons based on what else
   * is equipped (1d10 when off-hand is free; 1d8 when a shield or second weapon
   * is equipped). Present on `InventoryItem.weapon`; absent on catalog `Item.weapon`.
   */
  damage?: {
    damageDiceCount: number;
    damageDiceFaces: number;
    damageModifier: number;
    damageType: string;
    grip: "one-handed" | "two-handed" | "versatile-two-handed";
  };
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
  | { type: "sell"; inventoryItemId: string; quantity?: number; currencyDelta: Currency }
  /** Equips or unequips an item. Unlike `update`, this IS logged on the timeline. */
  | { type: "setEquipped"; inventoryItemId: string; equipped: boolean };

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
  | "resources"
  | "combat";

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
  | "learnManeuver" | "forgetManeuver" | "maneuversReconciled" // resources (cont.)
  | "learnToolProficiency" | "forgetToolProficiency" | "toolProficienciesReconciled" // resources
  | "combatStarted" | "combatEnded" | "combatRoundAdvanced"   // combat lifecycle
  | "attackRoll" | "damageRoll"                               // combat rolls
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

/** Spell verbal/somatic/material component flags + optional material text. */
export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription?: string;
}

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
  components?: SpellComponents | null;
  saveEffect?: "half" | "none" | null;
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
  components?: SpellComponents | null;
  saveEffect?: "half" | "none" | null;
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

/**
 * A derived attack row — unarmed strike or improvised weapon — computed
 * server-side and surfaced on the character so `AttacksPanel` can render them
 * without reproducing combat rules on the client.
 */
export interface DerivedAttack {
  attackBonus: number;
  damage: {
    count: number;
    faces: number;
    modifier: number;
    damageType: string;
  };
}

/** DerivedAttack extended with a proficiency flag (for improvised weapons). */
export interface DerivedImprovisedAttack extends DerivedAttack {
  proficient: boolean;
}

/**
 * A structured mechanical effect defined on a catalog or custom feat.
 * Snapshot into AdvancementEntry.improvements at take-time.
 */
export interface FeatImprovement {
  /** Numeric: "initiative" | "speed" | "armorClass" | "maxHp"
   *  Combat:  "unarmedDamageDie" (amount = die faces, e.g. 4 → d4; max across feats)
   *  Keyed:   "skillProficiency" | "savingThrowProficiency" (require `key`) */
  target: string;
  amount: number;
  perLevel?: boolean; // true → effective bonus = amount × hitDice.total (e.g. Tough)
  /** Skill name for skillProficiency; ability name for savingThrowProficiency. */
  key?: string;
}

/**
 * One taken Ability Score Improvement or feat on a character.
 * Mirrors backend/src/lib/resources.ts AdvancementEntry.
 */
export interface AdvancementEntry {
  id: string;
  level: number;
  kind: "asi" | "feat";
  /** Score bumps applied: e.g. { strength: 2 } or { dexterity: 1, constitution: 1 } */
  abilityDeltas: Record<string, number>;
  /** HP delta added to max/current at time of choice. */
  hpDelta: number;
  /** Initiative delta added at time of choice. */
  initDelta: number;
  featId?: string;
  featName?: string;
  featDescription?: string;
  /** Snapshot of the feat's structured mechanical effects. Applied as a read-time bonus layer. */
  improvements?: FeatImprovement[];
}

/** Slot count summary for advancement choices. */
export interface AdvancementSlots {
  total: number;
  used: number;
}

/** Catalog feat served by GET /api/feats. */
export interface CatalogFeat {
  id: string;
  name: string;
  description: string;
  prerequisite?: string;
  /** Ability names the player may choose to bump by abilityIncrease. Empty = not a half-feat. */
  abilityOptions: string[];
  /** Usually 1 for half-feats; 0 for full feats. */
  abilityIncrease: number;
  /** Structured static effects applied as a read-time bonus when this feat is active. */
  improvements: FeatImprovement[];
}

/**
 * One merged tool proficiency entry on the character wire type.
 * Creation-fixed profs (background/class/race) and level-gated subclass
 * profs (Student of War) are merged by serializeCharacter before sending.
 */
export interface ToolProficiency {
  name: string;
  category: "artisan" | "gamingSet" | "musicalInstrument" | "other";
  /** Where this proficiency came from. */
  source: "background" | "class" | "race" | "subclass";
}

/** Armor category that a character is proficient with. */
export type ArmorProficiencyCategory = "light" | "medium" | "heavy" | "shield";

/**
 * One armor proficiency entry — derived at read time from class + race + feats.
 * `category` identifies the armor type; `source` is the highest-priority origin
 * (class wins over race over feat when multiple sources would grant the same category).
 */
export interface ArmorProficiency {
  category: ArmorProficiencyCategory;
  source: "class" | "race" | "feat";
}

/**
 * One weapon proficiency entry — derived at read time from class + race + feats.
 * `name` may be a category ("Simple Weapons", "Martial Weapons") or a specific
 * weapon ("Longswords"). `source` is the highest-priority origin.
 */
export interface WeaponProficiency {
  name: string;
  source: "class" | "race" | "feat";
}

/** Level-gated tool proficiency entry within the resources JSON. */
export interface ToolProfEntry {
  id: string;   // per-character entry UUID
  name: string; // matches a TOOLS entry name
}

/** Derived class/subclass resource data merged with stored mutable state. */
export interface CharacterResources {
  features: ClassFeature[];
  maneuverChoiceCount?: number;
  maneuverSaveDC?: number;
  /** Number of artisan's-tool proficiency choices from a subclass feature. */
  toolProfChoiceCount?: number;
  pools: ResourcePool[];
  maneuversKnown: ManeuverEntry[];
  /** Level-gated tool proficiency choices (e.g. Student of War). */
  toolProficienciesKnown: ToolProfEntry[];
}

/** One entry in `Character.classes` — structured multiclass-aware view. */
export interface ClassEntry {
  name: string;
  level: number;
  subclass?: string;
  subclassId?: string;
  classId?: string;
}

// ── Action catalog types (Phase B) ───────────────────────────────────────────

/**
 * Action-economy cost — which slot an action consumes on the character's turn.
 * Mirrors the `ActionCost` enum on the backend Action model.
 */
export type ActionCost = "action" | "bonusAction" | "reaction" | "free" | "special";

/**
 * A lean "available action" entry attached to the serialized character.
 * Derived at read time by `deriveActions` in `backend/src/lib/actions.ts`.
 * Display copy (name/description) is joined from the `Action` catalog.
 * `enabled` cross-references remaining resource-pool counts so the frontend
 * can grey out abilities the character can't afford.
 */
export interface AvailableAction {
  /** Stable machine key matching `Action.key` in the catalog. */
  key: string;
  name: string;
  cost: ActionCost;
  /** False when the character can't currently use this action (e.g. no ki). */
  enabled: boolean;
  /** Human-readable reason why `enabled` is false; absent when enabled. */
  disabledReason?: string;
}

/** Full catalog entry served by `GET /api/actions`. */
export interface CatalogAction {
  id: string;
  key: string;
  name: string;
  description: string;
  cost: ActionCost;
  universal: boolean;
  grantClass?: string;
  grantSubclass?: string;
  grantLevel?: number;
  resourceKey?: string;
  resourceAmount?: number;
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
  /** Merged tool proficiencies — creation-fixed (background/class/race) and
   *  level-gated subclass choices (e.g. Student of War), deduped by name. */
  toolProficiencies: ToolProficiency[];
  /** Armor proficiencies derived at read time from class, race, and feats. */
  armorProficiencies: ArmorProficiency[];
  /** Weapon proficiencies derived at read time from class, race, and feats.
   *  Entries are either category-level ("Simple Weapons") or specific ("Longswords"). */
  weaponProficiencies: WeaponProficiency[];

  inventory: InventoryItem[];
  currency: Currency;

  spellcasting?: {
    ability: AbilityName;
    spellSaveDC: number;
    spellAttackBonus: number;
    slots: SpellSlots[];
    /**
     * Warlock Mystic Arcanum — one free cast per long rest of a spell at each
     * listed level (6th–9th). Empty/absent for every other caster.
     */
    arcana?: SpellSlots[];
    spells: Spell[];
  };

  resources?: CharacterResources;

  /**
   * Derived available actions for the current turn — filtered by class/level/
   * resource availability. Lean display objects; see `AvailableAction`.
   * Undefined for characters without a class (shouldn't occur in practice).
   */
  availableActions?: AvailableAction[];

  /** Derived unarmed-strike stats — attack bonus and damage always available
   *  since everyone is proficient with unarmed strikes in 5e. Damage faces
   *  start at 1 (flat 1 + STR mod) and are raised to d4 by Tavern Brawler. */
  unarmedStrike: DerivedAttack;
  /** Derived improvised-weapon stats — 1d4 + STR, always shown. `proficient`
   *  is true only when "Improvised Weapons" appears in weaponProficiencies
   *  (e.g. via Tavern Brawler), which adds proficiency bonus to attackBonus. */
  improvisedWeapon: DerivedImprovisedAttack;

  /** Taken ASI / feat entries, in the order chosen (clamped to advancementSlots.total). */
  advancements: AdvancementEntry[];
  /** How many advancement slots this character has earned at their level. */
  advancementSlots: AdvancementSlots;

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
  toolProficiencies: string[];
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
  /** Fixed tool proficiencies always granted by this class. */
  toolProficiencies: string[];
  /** Tool names the player may choose from at creation. */
  toolChoices: string[];
  /** Number of tool choices the player may make. */
  toolChoiceCount: number;
}

export interface BackgroundOption {
  id: string;
  name: string;
  skillProficiencies: SkillName[];
  toolProficiencies: string[];
}

/** One tool from the SRD TOOLS constant, served by GET /api/reference. */
export interface ToolOption {
  name: string;
  category: "artisan" | "gamingSet" | "musicalInstrument" | "other";
  cost?: { gp?: number; sp?: number; cp?: number };
  weight?: number;
}

export interface ReferenceTools {
  all: ToolOption[];
  byCategory: {
    artisan: ToolOption[];
    gamingSet: ToolOption[];
    musicalInstrument: ToolOption[];
    other: ToolOption[];
  };
}

export interface ReferenceData {
  races: RaceOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  alignments: string[];
  tools: ReferenceTools;
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
  /** Tool names chosen by the player (from class toolChoices). */
  toolChoices?: string[];
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
  components?: SpellComponents;
  saveEffect?: "half" | "none";
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

/**
 * Cast a spell: expend slot (if leveled), send client-computed roll total.
 * `apply` optionally applies the rolled effect to the caster's own HP in the
 * same atomic batch — used when the player targets themselves (heal or, rarely,
 * self-damage). Omitted when targeting others (no enemy entities exist).
 */
export interface CastSpellOperation {
  type: "castSpell";
  entryId: string;
  slotLevel?: number;
  roll: number;
  apply?: { target: "self"; kind: "heal" | "damage"; amount: number };
}
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
/** Choose an artisan's-tool proficiency from the Student of War feature. */
export interface LearnToolProficiencyOperation { type: "learnToolProficiency"; name: string }
/** Undo a subclass-granted tool proficiency choice. */
export interface ForgetToolProficiencyOperation { type: "forgetToolProficiency"; entryId: string }
export type ResourceOperation =
  | SpendResourceOperation
  | RestoreResourceOperation
  | LearnManeuverOperation
  | ForgetManeuverOperation
  | LearnToolProficiencyOperation
  | ForgetToolProficiencyOperation;

// ── Advancement operation types (mirrors backend/src/lib/advancement.ts) ─────
// Sent as `{ operations: AdvancementOperation[] }` to
// POST /api/characters/:id/advancement/transactions.

export interface TakeAsiOperation {
  type: "takeAsi";
  increases: { ability: string; amount: 1 | 2 }[];
}
export interface TakeFeatOperation {
  type: "takeFeat";
  featId?: string;
  custom?: {
    name: string;
    description: string;
    improvements?: FeatImprovement[];
    /** Ability names the player may choose for a half-feat-style bump. */
    abilityOptions?: string[];
    /** Amount to apply to the chosen ability (default 1). */
    abilityIncrease?: number;
  };
  /** Required when taking a half-feat (catalog or custom) with abilityOptions. */
  abilityChoice?: string;
}
export interface RemoveAdvancementOperation {
  type: "removeAdvancement";
  entryId: string;
}
export type AdvancementOperation =
  | TakeAsiOperation
  | TakeFeatOperation
  | RemoveAdvancementOperation;

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

// ── Action operation types (mirrors backend/src/lib/actions.ts) ─────────────
// Sent as `{ operations: ActionOperation[] }` to
// POST /api/characters/:id/actions/transactions.

/**
 * Execute a named action from the Action catalog. The server looks up
 * ACTION_EFFECT_FN[key], emits the appropriate domain ops (spendResource,
 * adjustQuantity, heal, etc.) within a single atomic transaction, and returns
 * the updated character. Client-rolled values (potion heal, die roll totals)
 * are passed via `roll`.
 */
export interface ExecuteActionOperation {
  type: "executeAction";
  /** Matches `Action.key` in the catalog (e.g. "drinkPotion", "rage"). */
  actionKey: string;
  /** Target inventory item id for item-consuming actions (e.g. drinkPotion). */
  inventoryItemId?: string;
  /**
   * Client-rolled total for actions whose effects involve dice (e.g. a potion
   * heal). The server validates and records this; it does NOT re-roll.
   * Absent for actions with no die roll.
   */
  roll?: number;
}

export type ActionOperation = ExecuteActionOperation;

// ── Session ───────────────────────────────────────────────────────────────────

export type SessionStatus = "active" | "ended";

export interface Session {
  id: string;
  characterId: string;
  status: SessionStatus;
  startedAt: string; // ISO 8601
  endedAt?: string;
  title?: string;
  summary?: unknown;
}
