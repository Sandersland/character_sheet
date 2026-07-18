/**
 * Inventory + item catalog wire types: items, weapon/armor/consumable detail, capabilities, and inventory operations.
 */

import type { Currency } from "./primitives";

export type ItemCategory = "weapon" | "armor" | "consumable" | "gear";

export type ArmorCategory = "light" | "medium" | "heavy" | "shield";

export type WeaponClass = "simple" | "martial";

export type WeaponRange = "melee" | "ranged";

/**
 * Weapon-specific mechanics, present (as `weapon`) only on a row whose
 * category is "weapon". Dice are decomposed (count/faces/modifier) to match
 * the `RollSpec` shape rather than a "1d6" string, so a future damage-roll
 * feature reads these directly — mirrors the `ItemWeaponDetail` model.
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
   * Derived damage roll spec — grip-resolved at read time by `deriveWeaponDamage`.
   * Encodes the correct die for versatile weapons based on what else
   * is equipped (1d10 when off-hand is free; 1d8 when a shield or second weapon
   * is equipped). Present on `InventoryItem.weapon`; absent on catalog `Item.weapon`.
   */
  damage?: {
    damageDiceCount: number;
    damageDiceFaces: number;
    damageModifier: number;
    /**
     * The governing ability modifier component of `damageModifier` (before any
     * melee-damage buff). Server-derived alongside `damageModifier`; used to
     * implement the Two-Weapon Fighting off-hand rule client-side — an off-hand
     * bonus attack omits the ability mod from damage unless the character has the
     * Two-Weapon Fighting style (#732).
     */
    abilityModifier?: number;
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
  // Limited-use charges (#121). Undefined = stackable (use decrements quantity);
  // set = charged (use decrements usesRemaining, recharges on long rest).
  maxUses?: number;
  usesRemaining?: number;
}

/**
 * Baseline equipment catalog served by `GET /api/items` — the "pick a
 * club, don't hand-author one" path for the inventory editor (Phase B).
 * `InventoryItem` below snapshots these fields (including `weapon`/`armor`/
 * `consumable`) rather than referencing this type live — mirrors the `Item`
 * and `InventoryItem` models.
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
 * Item capabilities & attunement (#546). Mirrors the backend `CapabilityKind`.
 * Only passiveBonus is authorable/rendered this slice; the reserved kinds
 * round-trip as opaque.
 */
export type CapabilityKind = "passiveBonus" | "castSpell" | "charges" | "grant" | "activatedEffect";

export type CapabilityTarget =
  | "ac"
  | "attack"
  | "damage"
  | "save"
  | "skill"
  | "abilityScore"
  | "spellAttack"
  | "spellDc"
  | "initiative"
  | "speed"
  | "maxHp";

export type CapabilityOp = "add" | "setTo";

export type AttunementPrereqKind = "class" | "spellcaster" | "species" | "alignment";

/** grant kind (#529). Mirrors the backend `GrantType`. */
export type GrantType = "resistance" | "immunity" | "conditionImmunity" | "advantage" | "proficiency";

export type AdvantageOn = "save" | "check" | "initiative" | "attack";

export type GrantValueKind = "damageType" | "condition" | "skill" | "ability" | "save" | "weapon" | "tool" | "language";

export type ProficiencyKind = "skill" | "save" | "weapon" | "tool" | "language";

/** Dice-valued bonus (e.g. +2d6 fire); consumed in the damage roll at #526C. */
export interface CapabilityDice {
  count: number;
  faces: number;
  damageType?: string;
}

/** One capability as served on a campaign item or an inventory-item snapshot. */
/** castSpell resource recharge (#528). atWill is unlimited; perDay ≈ long rest.
 * charges (#555) spends the item's shared pool (chargeCost per cast). */
export type CastResource = "perRestShort" | "perRestLong" | "perDayDawn" | "perDayDusk" | "atWill" | "charges";

/** Charges-pool recharge trigger (#555); dawn/dusk ≈ long rest. */
export type ChargeTrigger = "short" | "long" | "dawn" | "dusk";

/** Whether a castSpell DC/attack is a fixed item value or the wielder's own (#528). */
export type CastStatMode = "fixed" | "wielder";

export interface ItemCapability {
  kind: CapabilityKind;
  target?: CapabilityTarget;
  op?: CapabilityOp;
  value?: number;
  /** Specific skill/ability/save key when target is skill|abilityScore|save. */
  targetKey?: string;
  condition?: string;
  description?: string;
  dice?: CapabilityDice;
  // castSpell fields (#528).
  spellId?: string;
  spellName?: string;
  spellLevel?: number;
  castLevel?: number;
  resource?: CastResource;
  uses?: number;
  concentration?: boolean;
  dcMode?: CastStatMode;
  dcValue?: number;
  attackMode?: CastStatMode;
  attackValue?: number;
  /** activatedEffect (#543) — reuses target/op/value for the inline self-buff. */
  activation?: ActivationType;
  activatedDuration?: "whileActive" | "untilRest";
  resourceKind?: "perRest" | "perDay" | "atWill" | "charges";
  resourcePeriod?: "short" | "long" | "dawn" | "dusk";
  resourceCharges?: number;
  durationText?: string;
  /** grant kind (#529): the trait/proficiency the item confers while active. */
  grantType?: GrantType;
  grantOn?: AdvantageOn;
  grantValueKind?: GrantValueKind;
  grantValue?: string;
  cantBeSurprised?: boolean;
  /** charges pool (#555): the item's shared charge reservoir. */
  maxCharges?: number;
  recharge?: { trigger: ChargeTrigger; dice?: { count: number; faces: number }; bonus?: number };
  /** Pool charges a castSpell/activatedEffect spends when its resource is "charges" (default 1). */
  chargeCost?: number;
}

/** Item-granted-spell metadata on a Spell whose source is "item" (#528). */
export interface ItemSpellMeta {
  inventoryItemId: string;
  capabilityId: string;
  itemName: string;
  castLevel: number;
  resource: CastResource;
  usesRemaining: number;
  usesTotal: number;
  dcMode: CastStatMode;
  dc?: number | null;
  attackMode: CastStatMode;
  attack?: number | null;
  /** Pool charges per cast when resource is "charges" (#555); usesRemaining/Total mirror the pool. */
  chargeCost?: number;
}

/** Derived charge-pool state on an inventory item (#555): remaining is derived
 * (maxCharges − used) server-side; recharge is the human tooltip text. */
export interface ItemChargesState {
  max: number;
  remaining: number;
  recharge: string;
}

/** An item-granted damage resistance/immunity, tagged with its item source (#529). */
export interface ItemDamageTrait {
  damageType: string;
  source: string;
}

/** An item-granted condition immunity, tagged with its item source (#529). */
export interface ItemConditionImmunity {
  condition: string;
  source: string;
}

/** An item-granted advantage (rendered as reminder text on its surface) (#529). */
export interface ItemAdvantageGrant {
  on: AdvantageOn;
  valueKind?: GrantValueKind;
  value?: string;
  cantBeSurprised: boolean;
  source: string;
  description?: string;
}

/** An item-granted proficiency, for the item-source display marker (#529). */
export interface ItemProficiencyGrant {
  profType: ProficiencyKind;
  value: string;
  source: string;
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
/** Paper-doll placement slot (#565) — mirrors the backend `EquipSlot` enum. */
export type EquipSlot =
  | "MAIN_HAND"
  | "OFF_HAND"
  | "BODY"
  | "HEAD"
  | "NECK"
  | "CLOAK"
  | "HANDS"
  | "WRISTS"
  | "BELT"
  | "FEET"
  | "RING";

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
  /** The slot this item currently occupies (#565); absent = in the bag. */
  equippedSlot?: EquipSlot;
  /** Declared paper-doll slot for wearable gear (#565); absent = bag-only. */
  slot?: EquipSlot;
  /** Magic-item rarity tier snapshot; absent for mundane gear. */
  rarity?: ItemRarity;
  /** Attunement state (#546); the 3-item cap is derived, never stored. */
  attuned: boolean;
  /** Snapshotted from the source item — whether attunement is required to activate. */
  requiresAttunement: boolean;
  attunementPrereqKind?: AttunementPrereqKind;
  attunementPrereqValue?: string;

  notes?: string;
  weapon?: WeaponDetail;
  armor?: ArmorDetail;
  consumable?: ConsumableDetail;
  capabilities?: ItemCapability[];
  /** Activate/deactivate control state for an item's activatedEffect capability (#543). */
  activated?: ActivatedEffectState;
  /** Shared charge-pool state for an item with a charges capability (#555). */
  charges?: ItemChargesState;
}

// The derived activate/deactivate control state the API serializes for an
// activatedEffect item (#543). Absent when the item has no such capability.
export interface ActivatedEffectState {
  activation: ActivationType;
  reminder: string;
  maxUses: number | null;
  remainingUses: number | null;
  active: boolean;
  available: boolean;
}

export type ActivationType = "action" | "bonus" | "reaction" | "commandWord";

// Looser than WeaponDetail/ArmorDetail above (which describe what the API
// always returns, every flag included) — these describe what a client only
// has to *send*: just the fields the matching *Detail table's columns are
// NOT NULL for, matching the backend `WeaponDetailInput`/`ArmorDetailInput`
// exactly. Everything else defaults server-side and is refinable later via an
// `update` operation.
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

/**
 * Body for a custom (homebrew) `acquire` operation — same shape as `Item`
 * minus `id`, plus the category's required minimal detail block (the acquire
 * route rejects e.g. a "weapon" with no `weapon` block, since those columns
 * are NOT NULL). Matches the backend `CustomItemInput`.
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
 * batch — see `applyInventoryOperations` for the full semantics (which ops
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
  /** Consumes one use of a consumable (#121). `rolls` are client-rolled effect
   *  dice for the 3D animation; omit to have the server roll. */
  | { type: "use"; inventoryItemId: string; rolls?: number[] }
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
  | { type: "setEquipped"; inventoryItemId: string; equipped: boolean }
  /** Equips an item into an explicit paper-doll slot (#565); logged + undoable. */
  | { type: "equip"; inventoryItemId: string; slot: EquipSlot }
  /** Attunes an item — enforces the derived 3-item cap + prereq server-side (#546). */
  | { type: "attune"; inventoryItemId: string }
  /** Ends attunement; always legal (#546). */
  | { type: "unattune"; inventoryItemId: string }
  /** Activates / deactivates an item's activatedEffect capability (#543). */
  | { type: "activate"; inventoryItemId: string }
  | { type: "deactivate"; inventoryItemId: string };

/**
 * DM-authored campaign item (#380): loot/magic-item prep that lives in a
 * campaign, not on any sheet. Mirrors `Item` plus DM-only fields (rarity,
 * attunement, isUnique, dmNotes) and a reference to the fronting ITEM entity.
 * `dmNotes` is present only in owner-facing payloads — it's scrubbed server-side
 * from every player response.
 */
/** The six 5e magic-item rarity tiers; labels/values live in `@/lib/rarity`. */
export type ItemRarity = "COMMON" | "UNCOMMON" | "RARE" | "VERY_RARE" | "LEGENDARY" | "ARTIFACT";
