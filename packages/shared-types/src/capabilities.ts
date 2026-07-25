// Item-capability wire types (#1273) — de-duplicates the declarations that were
// hand-mirrored between the backend's serializeCapability / deriveItemGrants
// module and frontend/src/types/character/inventory.ts. The unions here used to
// be `(typeof TUPLE)[number]` over the backend's as-const tuples that feed the
// route zod schemas; the tuples stay backend-side and a contract test latches
// them to these declarations.

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

/** castSpell resource recharge (#528). atWill is unlimited; perDay ≈ long rest.
 * charges (#555) spends the item's shared pool (chargeCost per cast). */
export type CastResource =
  | "perRestShort"
  | "perRestLong"
  | "perDayDawn"
  | "perDayDusk"
  | "atWill"
  | "charges";

/** Whether a castSpell DC/attack is a fixed item value or the wielder's own (#528). */
export type CastStatMode = "fixed" | "wielder";

// activatedEffect axes (#543) — mirror the ActivationType / ActivatedDuration /
// ItemResourceKind / ItemResourcePeriod schema enums.
export type ActivationType = "action" | "bonus" | "reaction" | "commandWord";
export type ActivatedDurationKind = "whileActive" | "untilRest";
export type ItemResourceKind = "perRest" | "perDay" | "atWill" | "charges";
export type ItemResourcePeriod = "short" | "long" | "dawn" | "dusk";

/** Charges-pool recharge trigger (#555); dawn/dusk ≈ long rest. */
export type ChargeTrigger = "short" | "long" | "dawn" | "dusk";

// grant kind (#529). "sense"/"movement" are reserved: valid enum values the DM
// can't yet author and no derivation consumes them.
export type GrantType = "resistance" | "immunity" | "conditionImmunity" | "advantage" | "proficiency";

export type AdvantageOn = "save" | "check" | "initiative" | "attack";

// What grantValue names: a damage type, a condition, a skill/ability/save key,
// or a weapon/tool/language name. Disambiguates the flat grantValue column.
export type GrantValueKind =
  | "damageType"
  | "condition"
  | "skill"
  | "ability"
  | "save"
  | "weapon"
  | "tool"
  | "language";

/** Proficiency grants name one of these categories via grantValueKind. */
export type ProficiencyKind = "skill" | "save" | "weapon" | "tool" | "language";

// Dice-valued bonus (e.g. +2d6 fire) — round-trips now; consumed in the damage
// roll at #526C. damageType is non-nullable here because the serializers drop
// nulls; the backend's column-read form keeps its own nullable variant.
export interface CapabilityDice {
  count: number;
  faces: number;
  damageType?: string;
}

// The flat wire shape a capability serializes to — the same fields the DM authors
// and the sheet renders. Dice is nested; opaque kinds carry only kind+description.
export interface SerializedCapability {
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
  // activatedEffect (#543) — round-tripped so the DM editor can re-populate.
  // activatedDuration matches the authoring input field name (the internal
  // Capability shape calls it `duration`).
  activation?: ActivationType;
  activatedDuration?: ActivatedDurationKind;
  resourceKind?: ItemResourceKind;
  resourcePeriod?: ItemResourcePeriod;
  resourceCharges?: number;
  durationText?: string;
  // grant fields (#529) — the trait/proficiency the item confers while active.
  grantType?: GrantType;
  grantOn?: AdvantageOn;
  grantValueKind?: GrantValueKind;
  grantValue?: string;
  cantBeSurprised?: boolean;
  // charges pool (#555) — nested recharge mirrors the DM input shape.
  maxCharges?: number;
  recharge?: { trigger: ChargeTrigger; dice?: { count: number; faces: number }; bonus?: number };
  /** Pool charges a castSpell/activatedEffect spends when its resource is "charges" (default 1). */
  chargeCost?: number;
}

/** One item-sourced advantage grant (rendered as reminder text on its surface) (#529). */
export interface ItemAdvantageGrant {
  on: AdvantageOn;
  valueKind?: GrantValueKind;
  value?: string;
  cantBeSurprised: boolean;
  source: string;
  description?: string;
}

/** One item-sourced proficiency grant, merged into the derived proficiency lists (#529). */
export interface ItemProficiencyGrant {
  profType: ProficiencyKind;
  value: string;
  source: string;
}
