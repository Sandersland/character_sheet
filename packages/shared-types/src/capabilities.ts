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

/** castSpell recharge: atWill is unlimited, perDay ≈ long rest; charges spends the item's shared pool (chargeCost per cast). */
export type CastResource =
  | "perRestShort"
  | "perRestLong"
  | "perDayDawn"
  | "perDayDusk"
  | "atWill"
  | "charges";

/** Whether a castSpell DC/attack is a fixed item value or the wielder's own. */
export type CastStatMode = "fixed" | "wielder";

export type ActivationType = "action" | "bonus" | "reaction" | "commandWord";
export type ActivatedDurationKind = "whileActive" | "untilRest";
export type ItemResourceKind = "perRest" | "perDay" | "atWill" | "charges";
export type ItemResourcePeriod = "short" | "long" | "dawn" | "dusk";

/** Charges-pool recharge trigger; dawn/dusk ≈ long rest. */
export type ChargeTrigger = "short" | "long" | "dawn" | "dusk";

/** "sense"/"movement" are reserved: valid enum values the DM can't yet author and no derivation consumes them. */
export type GrantType = "resistance" | "immunity" | "conditionImmunity" | "advantage" | "proficiency";

export type AdvantageOn = "save" | "check" | "initiative" | "attack";

export type GrantValueKind =
  | "damageType"
  | "condition"
  | "skill"
  | "ability"
  | "save"
  | "weapon"
  | "tool"
  | "language";

export type ProficiencyKind = "skill" | "save" | "weapon" | "tool" | "language";

/** damageType excludes null (never undefined-vs-absent) — serializers drop nulls; the backend's column-read form keeps its own nullable variant. */
export interface CapabilityDice {
  count: number;
  faces: number;
  damageType?: string;
}

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
  // activatedDuration matches the authoring input field name; the internal Capability type calls this field `duration`.
  activation?: ActivationType;
  activatedDuration?: ActivatedDurationKind;
  resourceKind?: ItemResourceKind;
  resourcePeriod?: ItemResourcePeriod;
  resourceCharges?: number;
  durationText?: string;
  grantType?: GrantType;
  grantOn?: AdvantageOn;
  grantValueKind?: GrantValueKind;
  grantValue?: string;
  cantBeSurprised?: boolean;
  maxCharges?: number;
  recharge?: { trigger: ChargeTrigger; dice?: { count: number; faces: number }; bonus?: number };
  /** Pool charges a castSpell/activatedEffect spends when its resource is "charges" (default 1). */
  chargeCost?: number;
}

/** One item-sourced advantage grant, rendered as reminder text on its surface. */
export interface ItemAdvantageGrant {
  on: AdvantageOn;
  valueKind?: GrantValueKind;
  value?: string;
  cantBeSurprised: boolean;
  source: string;
  description?: string;
}

/** One item-sourced proficiency grant, merged into the derived proficiency lists. */
export interface ItemProficiencyGrant {
  profType: ProficiencyKind;
  value: string;
  source: string;
}
