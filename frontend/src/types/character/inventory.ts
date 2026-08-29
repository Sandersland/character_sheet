import type {
  ActivationType,
  ArmorCategory,
  ArmorDetailInput,
  AttunementPrereqKind,
  CastResource,
  CastStatMode,
  ItemCategory,
  ProficiencyKind,
  RollEventAttackComponents,
  SerializedCapability,
  ToolCategory,
  WeaponClass,
  WeaponDetailInput,
  WeaponRange,
} from "@character-sheet/shared-types";

import type { Currency } from "./primitives";

export type {
  ActivationType,
  ArmorCategory,
  AttunementPrereqKind,
  CastResource,
  CastStatMode,
  ItemCategory,
  ProficiencyKind,
  ToolCategory,
  WeaponClass,
  WeaponRange,
};
export type { ArmorDetailInput, WeaponDetailInput };
export type {
  AdvantageOn,
  CapabilityDice,
  CapabilityKind,
  CapabilityOp,
  CapabilityTarget,
  ChargeTrigger,
  GrantType,
  GrantValueKind,
  ItemAdvantageGrant,
  ItemProficiencyGrant,
} from "@character-sheet/shared-types";
// Aliased so this module doesn't need to rename its 80+ call sites.
export type { SerializedCapability as ItemCapability };

/** Dice are decomposed to match the `RollSpec` shape rather than a "1d6" string. */
// fallow-ignore-next-line code-duplication -- mirrors shared-types' WeaponDetailInput field-for-field, by design (#1272)
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
  /** Present on `InventoryItem.weapon`; absent on catalog `Item.weapon`. */
  attackBonus?: number;
  /** Sums to `attackBonus` by construction; present on `InventoryItem.weapon` only. */
  attackBonusComponents?: RollEventAttackComponents;
  /** Grip-resolved at read time by `deriveWeaponDamage`; present on `InventoryItem.weapon` only, absent on catalog `Item.weapon`. */
  damage?: {
    damageDiceCount: number;
    damageDiceFaces: number;
    damageModifier: number;
    /** Used client-side to implement the Two-Weapon Fighting off-hand rule: an off-hand bonus attack omits the ability mod unless the character has that fighting style. */
    abilityModifier?: number;
    /** The other addend folded into `damageModifier` (an active meleeDamage buff). */
    meleeDamageBonus?: number;
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

/** Present only on consumables that actually have a roll effect — not every consumable does. */
export interface ConsumableDetail {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
  // Undefined = stackable (use decrements quantity); set = charged (use decrements usesRemaining, recharges on long rest).
  maxUses?: number;
  usesRemaining?: number;
}

/** `InventoryItem` snapshots these fields rather than referencing this type live. */
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
  // Set only for Item rows that are tools; lets the starting-equipment dropdown filter on it directly.
  toolCategory?: ToolCategory;
}

/** Metadata on a Spell whose source is "item". */
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
  /** Pool charges per cast when resource is "charges"; usesRemaining/Total mirror the pool. */
  chargeCost?: number;
}

/** `remaining` is derived server-side (max − used); `recharge` is human tooltip text. */
export interface ItemChargesState {
  max: number;
  remaining: number;
  recharge: string;
}

// Unlike their advantage/proficiency siblings, these ARE the wire shapes — `serializeCharacter`
// remaps a generic {value, source} to `damageType`/`condition`.
export interface ItemDamageTrait {
  damageType: string;
  source: string;
}

export interface ItemConditionImmunity {
  condition: string;
  source: string;
}

/** Mirrors the backend `EquipSlot` enum. */
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

/** `itemId` undefined means homebrew/no catalog match; every field below is this row's own value, free to diverge from the catalog. */
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
  /** The slot this item currently occupies; absent = in the bag. */
  equippedSlot?: EquipSlot;
  /** Declared paper-doll slot for wearable gear; absent = bag-only. */
  slot?: EquipSlot;
  /** Not equivalent to `allowedSlots.length > 0` — a ring is placeable in the loadout picker but gets no equip toggle. */
  equippable: boolean;
  /** Empty = bag-only. */
  allowedSlots: EquipSlot[];
  /** `true` for items with no derivable requirement is a no-warn display policy, not a rules claim. */
  proficient: boolean;
  /** Magic-item rarity tier snapshot; absent for mundane gear. */
  rarity?: ItemRarity;
  /** Attunement state; the 3-item cap is derived, never stored. */
  attuned: boolean;
  /** Snapshotted from the source item — whether attunement is required to activate. */
  requiresAttunement: boolean;
  attunementPrereqKind?: AttunementPrereqKind;
  attunementPrereqValue?: string;
  /** Byte-identical to the string an unmet-prerequisite attune is rejected with; never compose it client-side. */
  attunementPrereqText?: string;
  /** 2014 Eldritch Knight Weapon Bond, PHB'14 p.75 — may read stale until the reconciler runs; display only, since `availableActions` is already clamped. */
  weaponBonded: boolean;

  notes?: string;
  weapon?: WeaponDetail;
  armor?: ArmorDetail;
  consumable?: ConsumableDetail;
  capabilities?: SerializedCapability[];
  /** Activate/deactivate control state for an item's activatedEffect capability. */
  activated?: ActivatedEffectState;
  /** Shared charge-pool state for an item with a charges capability. */
  charges?: ItemChargesState;
}

export interface ActivatedEffectState {
  activation: ActivationType;
  reminder: string;
  maxUses: number | null;
  remainingUses: number | null;
  active: boolean;
  available: boolean;
}

/** The acquire route rejects a category missing its required detail block — those columns are NOT NULL server-side. */
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

/** One operation in a `POST /api/characters/:id/inventory/transactions` batch; see `applyInventoryOperations` for full semantics. */
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
  /** `rolls` are client-rolled effect dice for the 3D animation; omit to have the server roll. */
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
  /** Equips an item into an explicit paper-doll slot; logged + undoable. */
  | { type: "equip"; inventoryItemId: string; slot: EquipSlot }
  /** Enforces the derived 3-item cap + prereq server-side. */
  | { type: "attune"; inventoryItemId: string }
  /** Ends attunement; always legal. */
  | { type: "unattune"; inventoryItemId: string }
  | { type: "activate"; inventoryItemId: string }
  | { type: "deactivate"; inventoryItemId: string };

/** Labels and gp values are served as `ItemRarityOption` rows on `GET /api/reference`, never held client-side; `rarityLabel` resolves against those rows. */
export type ItemRarity = "COMMON" | "UNCOMMON" | "RARE" | "VERY_RARE" | "LEGENDARY" | "ARTIFACT";
