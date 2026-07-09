// Item-capability adapter (#545). Mirrors readEffectSpec (effects.ts) and
// readAbilityCost (ability-cost.ts): a flat-column side-table row → a typed,
// kind-discriminated Capability. All five kinds are materialized: passiveBonus,
// castSpell (#528), grant (#529), activatedEffect (#543), charges (#555).

import { casterFractionFor } from "./srd.js";

export type CapabilityKind = "passiveBonus" | "castSpell" | "charges" | "grant" | "activatedEffect";

// The passiveBonus target enum, as a value tuple so the route's zod schema and
// the frontend option list share one source of truth with the type below.
export const CAPABILITY_TARGETS = [
  "ac",
  "attack",
  "damage",
  "save",
  "skill",
  "abilityScore",
  "spellAttack",
  "spellDc",
  "initiative",
  "speed",
  "maxHp",
] as const;

export type CapabilityTarget = (typeof CAPABILITY_TARGETS)[number];

export const CAPABILITY_OPS = ["add", "setTo"] as const;
export type CapabilityOp = (typeof CAPABILITY_OPS)[number];

export const ATTUNEMENT_PREREQ_KINDS = ["class", "spellcaster", "species", "alignment"] as const;
export type AttunementPrereqKind = (typeof ATTUNEMENT_PREREQ_KINDS)[number];

// castSpell resource + stat-mode enums (#528), value tuples so the route schema
// and the frontend option lists share one source of truth with the types below.
export const CAST_RESOURCES = ["perRestShort", "perRestLong", "perDayDawn", "perDayDusk", "atWill", "charges"] as const;
export type CastResource = (typeof CAST_RESOURCES)[number];

export const CAST_STAT_MODES = ["fixed", "wielder"] as const;
export type CastStatMode = (typeof CAST_STAT_MODES)[number];

// activatedEffect axes (#543) — mirror the ActivationType / ActivatedDuration /
// ItemResourceKind / ItemResourcePeriod schema enums.
export type ActivationType = "action" | "bonus" | "reaction" | "commandWord";
export type ActivatedDurationKind = "whileActive" | "untilRest";
export type ItemResourceKind = "perRest" | "perDay" | "atWill" | "charges";
export type ItemResourcePeriod = "short" | "long" | "dawn" | "dusk";

// Recharge triggers for a charges pool (#555) — the ItemResourcePeriod values,
// as a tuple so the route schema and frontend option list share one source.
export const CHARGE_TRIGGERS = ["short", "long", "dawn", "dusk"] as const;
export type ChargeTrigger = (typeof CHARGE_TRIGGERS)[number];

// grant kind (#529). "sense"/"movement" are reserved: valid enum values the DM
// can't yet author and no derivation consumes them.
export const GRANT_TYPES = ["resistance", "immunity", "conditionImmunity", "advantage", "proficiency"] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export const ADVANTAGE_ON = ["save", "check", "initiative", "attack"] as const;
export type AdvantageOn = (typeof ADVANTAGE_ON)[number];

// What grantValue names: a damage type, a condition, a skill/ability/save key,
// or a weapon/tool/language name. Disambiguates the flat grantValue column.
export const GRANT_VALUE_KINDS = ["damageType", "condition", "skill", "ability", "save", "weapon", "tool", "language"] as const;
export type GrantValueKind = (typeof GRANT_VALUE_KINDS)[number];

// Proficiency grants name one of these categories via grantValueKind.
const PROFICIENCY_KINDS = ["skill", "save", "weapon", "tool", "language"] as const;
export type ProficiencyKind = (typeof PROFICIENCY_KINDS)[number];

// Dice-valued bonus payload — round-trips now; consumed in the damage roll at #526C.
export interface CapabilityDice {
  count: number;
  faces: number;
  damageType?: string | null;
}

export interface PassiveBonusCapability {
  kind: "passiveBonus";
  target: CapabilityTarget;
  op: CapabilityOp;
  value: number;
  targetKey?: string | null;
  condition?: string | null;
  description?: string | null;
  dice?: CapabilityDice | null;
}

// A castSpell capability (#528): the item casts a referenced Spell from its own
// resource. DC/attack are either fixed item values or resolve to the wielder's.
export interface CastSpellCapability {
  kind: "castSpell";
  spellId: string;
  spellName: string;
  spellLevel: number;
  castLevel: number;
  resource: CastResource;
  uses: number;
  concentration: boolean;
  dcMode: CastStatMode;
  dcValue?: number | null;
  attackMode: CastStatMode;
  attackValue?: number | null;
  // Pool charges spent per cast when resource is "charges" (#555); 1 when unset.
  chargeCost: number;
  description?: string | null;
}

// An activatedEffect (#543): a command-word / action / bonus-action toggle that
// seeds a while-active (or until-rest) self-buff and spends an item resource. The
// inline self-buff reuses the passiveBonus target/op/value shape.
export interface ActivatedEffectCapability {
  kind: "activatedEffect";
  activation: ActivationType;
  target: CapabilityTarget;
  op: CapabilityOp;
  value: number;
  targetKey?: string | null;
  duration: ActivatedDurationKind;
  resourceKind: ItemResourceKind;
  resourcePeriod?: ItemResourcePeriod | null;
  resourceCharges: number;
  // Pool charges spent per activation when resourceKind is "charges" (#555).
  chargeCost: number;
  durationText?: string | null;
  description?: string | null;
}

// A grant capability (#529): a resistance/immunity/conditionImmunity/advantage/
// proficiency the item confers while active. grantOn is advantage-only; grantValue
// is null for whole-axis advantage (e.g. all initiative rolls).
export interface GrantCapability {
  kind: "grant";
  grantType: GrantType;
  grantOn?: AdvantageOn | null;
  grantValueKind?: GrantValueKind | null;
  grantValue?: string | null;
  cantBeSurprised: boolean;
  description?: string | null;
}

// The item's shared charge pool (#555) — at most one per item. Spending
// capabilities (castSpell/activatedEffect with a `charges` resource) draw from
// it implicitly; remaining = maxCharges − the row's `used` counter (derived,
// never stored). Null recharge dice = full refill on the trigger.
export interface ChargesCapability {
  kind: "charges";
  maxCharges: number;
  rechargeTrigger: ChargeTrigger;
  rechargeDice?: { count: number; faces: number } | null;
  rechargeBonus?: number | null;
  description?: string | null;
}

// A malformed capability row (e.g. a charges row missing maxCharges) reads as
// opaque so callers skip payload fields rather than throw. All five kinds are
// materialized, so the Exclude<> is `never`: no well-formed row lands here, and
// the fallback cast in readCapability is the single escape hatch. (Kept literal
// so discriminant narrowing on Capability.kind stays sound.)
export interface OpaqueCapability {
  kind: Exclude<CapabilityKind, "passiveBonus" | "castSpell" | "activatedEffect" | "grant" | "charges">;
  description?: string | null;
}

export type Capability =
  | PassiveBonusCapability
  | CastSpellCapability
  | ActivatedEffectCapability
  | GrantCapability
  | ChargesCapability
  | OpaqueCapability;

// Number of uses a castSpell capability has per recharge period. atWill is
// unlimited (Infinity); every other resource defaults to 1 when uses is unset.
export function castUsesTotal(cap: CastSpellCapability): number {
  if (cap.resource === "atWill") return Infinity;
  return cap.uses > 0 ? cap.uses : 1;
}

// Does a castSpell resource recharge on the given rest? perRestShort recharges on
// a short OR long rest; perRestLong and the perDay dawn/dusk approximations recharge
// on a long rest only; atWill never tracks uses (nothing to reset). charges spends
// the item's shared pool — the POOL recharges (rechargeItemChargePoolsOnRest),
// never the capability's own counter.
export function castResourceRechargesOn(resource: string, rest: "short" | "long"): boolean {
  if (resource === "atWill" || resource === "charges") return false;
  if (resource === "perRestShort") return true; // short or long
  return rest === "long";
}

// Does a charges pool's recharge trigger fire on the given rest? `short` fires on
// a short OR long rest; `long` and the dawn/dusk day-boundary approximations fire
// on a long rest only (same convention as castResourceRechargesOn).
export function chargeTriggerRechargesOn(trigger: ChargeTrigger, rest: "short" | "long"): boolean {
  if (trigger === "short") return true; // short or long
  return rest === "long";
}

// The flat columns shared by CampaignItemCapability and InventoryCapability.
export interface CapabilityColumns {
  kind: string;
  description?: string | null;
  target?: string | null;
  op?: string | null;
  value?: number | null;
  targetKey?: string | null;
  condition?: string | null;
  valueDiceCount?: number | null;
  valueDiceFaces?: number | null;
  valueDamageType?: string | null;
  spellId?: string | null;
  spellName?: string | null;
  spellLevel?: number | null;
  castLevel?: number | null;
  castResource?: string | null;
  castUses?: number | null;
  castConcentration?: boolean | null;
  dcMode?: string | null;
  dcValue?: number | null;
  attackMode?: string | null;
  attackValue?: number | null;
  activation?: string | null;
  activatedDuration?: string | null;
  resourceKind?: string | null;
  resourcePeriod?: string | null;
  resourceCharges?: number | null;
  durationText?: string | null;
  grantType?: string | null;
  grantOn?: string | null;
  grantValueKind?: string | null;
  grantValue?: string | null;
  cantBeSurprised?: boolean | null;
  maxCharges?: number | null;
  rechargeDiceCount?: number | null;
  rechargeDiceFaces?: number | null;
  rechargeBonus?: number | null;
  rechargeTrigger?: string | null;
  chargeCost?: number | null;
}

// Nullish default as a call, not a `??` operator — keeps the per-kind readers'
// field defaulting out of their branch count (each `??` is a cyclomatic branch).
function orElse<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

// Optional dice payload shared by passiveBonus (value dice) and charges (recharge
// dice): present only when both count and faces are set, else null.
function readDicePair(count?: number | null, faces?: number | null): { count: number; faces: number } | null {
  return count && faces ? { count, faces } : null;
}

// Per-kind readers over the flat columns. Each returns null when the row is
// malformed for its kind (missing a required column), so readCapability falls
// through to opaque rather than throwing.
function readCastSpellRow(row: CapabilityColumns): CastSpellCapability | null {
  if (!row.spellId) return null;
  return {
    kind: "castSpell",
    spellId: row.spellId,
    spellName: orElse(row.spellName, ""),
    spellLevel: orElse(row.spellLevel, 0),
    castLevel: orElse(row.castLevel, orElse(row.spellLevel, 0)),
    resource: orElse(row.castResource as CastResource | null, "perDayDawn"),
    uses: orElse(row.castUses, 1),
    concentration: orElse(row.castConcentration, false),
    dcMode: orElse(row.dcMode as CastStatMode | null, "fixed"),
    dcValue: orElse(row.dcValue, null),
    attackMode: orElse(row.attackMode as CastStatMode | null, "fixed"),
    attackValue: orElse(row.attackValue, null),
    chargeCost: orElse(row.chargeCost, 1),
    description: orElse(row.description, null),
  };
}

function readChargesRow(row: CapabilityColumns): ChargesCapability | null {
  if (row.maxCharges == null) return null;
  return {
    kind: "charges",
    maxCharges: row.maxCharges,
    rechargeTrigger: orElse(row.rechargeTrigger as ChargeTrigger | null, "dawn"),
    rechargeDice: readDicePair(row.rechargeDiceCount, row.rechargeDiceFaces),
    rechargeBonus: orElse(row.rechargeBonus, null),
    description: orElse(row.description, null),
  };
}

function readGrantRow(row: CapabilityColumns): GrantCapability | null {
  if (!row.grantType) return null;
  return {
    kind: "grant",
    grantType: row.grantType as GrantType,
    grantOn: orElse(row.grantOn as AdvantageOn | null, null),
    grantValueKind: orElse(row.grantValueKind as GrantValueKind | null, null),
    grantValue: orElse(row.grantValue, null),
    cantBeSurprised: orElse(row.cantBeSurprised, false),
    description: orElse(row.description, null),
  };
}

function readPassiveBonusRow(row: CapabilityColumns): PassiveBonusCapability | null {
  if (!row.target || !row.op) return null;
  const base = readDicePair(row.valueDiceCount, row.valueDiceFaces);
  const dice = base ? { ...base, damageType: orElse(row.valueDamageType, null) } : null;
  return {
    kind: "passiveBonus",
    target: row.target as CapabilityTarget,
    op: row.op as CapabilityOp,
    value: orElse(row.value, 0),
    targetKey: orElse(row.targetKey, null),
    condition: orElse(row.condition, null),
    description: orElse(row.description, null),
    dice,
  };
}

function readActivatedEffectRow(row: CapabilityColumns): ActivatedEffectCapability | null {
  if (!row.activation || !row.target || !row.op) return null;
  return {
    kind: "activatedEffect",
    activation: row.activation as ActivationType,
    target: row.target as CapabilityTarget,
    op: row.op as CapabilityOp,
    value: orElse(row.value, 0),
    targetKey: orElse(row.targetKey, null),
    duration: row.activatedDuration === "untilRest" ? "untilRest" : "whileActive",
    resourceKind: orElse(row.resourceKind as ItemResourceKind | null, "atWill"),
    resourcePeriod: orElse(row.resourcePeriod as ItemResourcePeriod | null, null),
    resourceCharges: orElse(row.resourceCharges, 1),
    chargeCost: orElse(row.chargeCost, 1),
    durationText: orElse(row.durationText, null),
    description: orElse(row.description, null),
  };
}

// Dispatch table keyed by the row's kind discriminant.
const CAPABILITY_READERS: Record<string, ((row: CapabilityColumns) => Capability | null) | undefined> = {
  castSpell: readCastSpellRow,
  charges: readChargesRow,
  grant: readGrantRow,
  passiveBonus: readPassiveBonusRow,
  activatedEffect: readActivatedEffectRow,
};

// Adapter over the flat capability columns — one CampaignItemCapability row per
// capability, with no per-kind DB tables (the dispatch table above is code, not
// schema). A malformed
// passiveBonus (missing target/op) or grant (missing grantType) reads as opaque
// rather than throwing.
export function readCapability(row: CapabilityColumns): Capability {
  return (
    CAPABILITY_READERS[row.kind]?.(row) ?? { kind: row.kind as OpaqueCapability["kind"], description: row.description ?? null }
  );
}

// Max uses per recharge for an activatedEffect. atWill is unlimited (null = no
// cap); perRest/perDay allow resourceCharges uses (default 1) per period. A
// charges-costed effect is gated by the item's shared pool, not a per-item
// counter — null here (applyActivate spends the pool instead).
export function activatedMaxUses(cap: ActivatedEffectCapability): number | null {
  if (cap.resourceKind === "atWill" || cap.resourceKind === "charges") return null;
  return Math.max(1, cap.resourceCharges);
}

// The rest that recharges an activatedEffect's uses, or null when it never rests
// (atWill, or charges — the pool recharges itself). perRest(short) recharges on a
// short rest; perRest(long) and perDay (dawn/dusk approximated) on a long rest.
export function activatedRechargeRest(cap: ActivatedEffectCapability): "short" | "long" | null {
  if (cap.resourceKind === "atWill" || cap.resourceKind === "charges") return null;
  if (cap.resourceKind === "perRest" && cap.resourcePeriod === "short") return "short";
  return "long";
}

// The item's shared charge pool (#555): the first well-formed kind=charges row,
// paired with its raw row so callers keep the row's id/used fields. Authoring
// enforces at most one pool per item; extra rows are ignored, not merged.
export function chargePoolOf<T extends CapabilityColumns>(
  rows: T[],
): { cap: ChargesCapability; row: T } | null {
  for (const row of rows) {
    const cap = readCapability(row);
    // Field-presence guard (same reasoning as activatedCapabilityOf): a malformed
    // charges row falls through to opaque, which still carries kind "charges" at
    // runtime — require maxCharges so it can't masquerade as the pool.
    if (cap.kind === "charges" && "maxCharges" in cap) return { cap, row };
  }
  return null;
}

// Human phrasing for a pool's recharge: "regains 1d6+1 at dawn", "regains 1 at
// dawn" (fixed amount), "refills on a long rest" (no dice, no bonus = full refill).
export function describeChargeRecharge(cap: ChargesCapability): string {
  const when =
    cap.rechargeTrigger === "dawn"
      ? "at dawn"
      : cap.rechargeTrigger === "dusk"
        ? "at dusk"
        : cap.rechargeTrigger === "short"
          ? "on a short rest"
          : "on a long rest";
  if (cap.rechargeDice) {
    const bonus = cap.rechargeBonus ? `+${cap.rechargeBonus}` : "";
    return `regains ${cap.rechargeDice.count}d${cap.rechargeDice.faces}${bonus} ${when}`;
  }
  if (cap.rechargeBonus) return `regains ${cap.rechargeBonus} ${when}`;
  return `refills ${when}`;
}

// Human phrasing for an activation type (the reminder text prefix). Internal to
// describeActivatedReminder — not exported (the frontend has its own copy).
function describeActivation(activation: ActivationType): string {
  switch (activation) {
    case "action":
      return "Action";
    case "bonus":
      return "Bonus action";
    case "reaction":
      return "Reaction";
    case "commandWord":
      return "Command word";
  }
}

// Reminder text an activated item surfaces: the activation verb + the duration
// approximation. A free-text durationText ("10 minutes") is shown verbatim since
// no minute timer is modeled — the holder toggles it off manually or on a rest.
export function describeActivatedReminder(cap: ActivatedEffectCapability): string {
  const parts = [describeActivation(cap.activation)];
  if (cap.durationText) {
    parts.push(`lasts ${cap.durationText} (toggle off manually)`);
  } else if (cap.duration === "untilRest") {
    parts.push(activatedRechargeRest(cap) === "short" ? "until a short rest" : "until a long rest");
  } else {
    parts.push("while active (toggle off)");
  }
  return parts.join(" · ");
}

// The flat wire shape a capability serializes to — the same fields the DM authors
// and the sheet renders. Dice is nested; opaque kinds carry only kind+description.
export interface SerializedCapability {
  kind: CapabilityKind;
  target?: CapabilityTarget;
  op?: CapabilityOp;
  value?: number;
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
  // grant fields (#529).
  grantType?: GrantType;
  grantOn?: AdvantageOn;
  grantValueKind?: GrantValueKind;
  grantValue?: string;
  cantBeSurprised?: boolean;
  // charges pool (#555) — nested recharge mirrors the DM input shape.
  maxCharges?: number;
  recharge?: { trigger: ChargeTrigger; dice?: { count: number; faces: number }; bonus?: number };
  // Pool cost on a spending castSpell/activatedEffect capability (omitted = 1).
  chargeCost?: number;
}

// Per-kind serializers. Each drops nulls so the wire shape matches the optional-
// field DM input; nested dice/recharge mirror the authoring shape.
function serializeCastSpell(cap: CastSpellCapability): SerializedCapability {
  return {
    kind: cap.kind,
    spellId: cap.spellId,
    spellName: cap.spellName,
    spellLevel: cap.spellLevel,
    castLevel: cap.castLevel,
    resource: cap.resource,
    uses: cap.uses,
    concentration: cap.concentration,
    dcMode: cap.dcMode,
    ...(cap.dcValue != null ? { dcValue: cap.dcValue } : {}),
    attackMode: cap.attackMode,
    ...(cap.attackValue != null ? { attackValue: cap.attackValue } : {}),
    ...(cap.resource === "charges" ? { chargeCost: cap.chargeCost } : {}),
    ...(cap.description ? { description: cap.description } : {}),
  };
}

function serializeCharges(cap: ChargesCapability): SerializedCapability {
  return {
    kind: cap.kind,
    maxCharges: cap.maxCharges,
    recharge: {
      trigger: cap.rechargeTrigger,
      ...(cap.rechargeDice ? { dice: { count: cap.rechargeDice.count, faces: cap.rechargeDice.faces } } : {}),
      ...(cap.rechargeBonus != null ? { bonus: cap.rechargeBonus } : {}),
    },
    ...(cap.description ? { description: cap.description } : {}),
  };
}

function serializeGrant(cap: GrantCapability): SerializedCapability {
  return {
    kind: cap.kind,
    grantType: cap.grantType,
    ...(cap.grantOn ? { grantOn: cap.grantOn } : {}),
    ...(cap.grantValueKind ? { grantValueKind: cap.grantValueKind } : {}),
    ...(cap.grantValue ? { grantValue: cap.grantValue } : {}),
    ...(cap.cantBeSurprised ? { cantBeSurprised: true } : {}),
    ...(cap.description ? { description: cap.description } : {}),
  };
}

function serializePassiveBonus(cap: PassiveBonusCapability): SerializedCapability {
  return {
    kind: cap.kind,
    target: cap.target,
    op: cap.op,
    value: cap.value,
    ...(cap.targetKey ? { targetKey: cap.targetKey } : {}),
    ...(cap.condition ? { condition: cap.condition } : {}),
    ...(cap.description ? { description: cap.description } : {}),
    ...(cap.dice ? { dice: { count: cap.dice.count, faces: cap.dice.faces, ...(cap.dice.damageType ? { damageType: cap.dice.damageType } : {}) } } : {}),
  };
}

function serializeActivatedEffect(cap: ActivatedEffectCapability): SerializedCapability {
  return {
    kind: cap.kind,
    activation: cap.activation,
    target: cap.target,
    op: cap.op,
    value: cap.value,
    activatedDuration: cap.duration,
    resourceKind: cap.resourceKind,
    resourceCharges: cap.resourceCharges,
    ...(cap.targetKey ? { targetKey: cap.targetKey } : {}),
    ...(cap.resourcePeriod ? { resourcePeriod: cap.resourcePeriod } : {}),
    ...(cap.resourceKind === "charges" ? { chargeCost: cap.chargeCost } : {}),
    ...(cap.durationText ? { durationText: cap.durationText } : {}),
    ...(cap.description ? { description: cap.description } : {}),
  };
}

// Serialize a capability row for the API (campaign item + inventory item alike),
// dropping nulls so the wire shape matches the optional-field DM input.
export function serializeCapability(row: CapabilityColumns): SerializedCapability {
  const cap = readCapability(row);
  switch (cap.kind) {
    case "castSpell":
      return serializeCastSpell(cap);
    case "charges":
      return serializeCharges(cap);
    case "grant":
      return serializeGrant(cap);
    case "passiveBonus":
      return serializePassiveBonus(cap);
    case "activatedEffect":
      return serializeActivatedEffect(cap);
    default:
      // Malformed-row fallthrough (cap is OpaqueCapability, kind typed never) —
      // emit the raw row's kind + description so the wire still names the payload.
      return { kind: row.kind as CapabilityKind, ...(row.description ? { description: row.description } : {}) };
  }
}

// The buffsByTarget channel key a scalar passiveBonus contributes to, or null
// when the target isn't yet wired into a per-target modifier channel: dice→damage
// (#526C) and save/abilityScore/spell*/initiative/speed/maxHp (later slices).
// The "ac" channel (#383) is consumed at the serialize acParts seam, not by
// buffsByTarget. Reuses the same channel keys active buffs already use so item
// bonuses and cast buffs sum together on read.
export function passiveBonusChannel(cap: PassiveBonusCapability): string | null {
  switch (cap.target) {
    case "skill":
      return cap.targetKey ?? null;
    case "damage":
      return "meleeDamage";
    case "attack":
      return "attackRoll";
    case "ac":
      return "ac";
    default:
      return null;
  }
}

// One resolved item passive contribution, shaped like the fields serializeCharacter
// reads off an ActiveBuff (source + modifier) so it merges into the same channel.
export interface ItemPassiveContribution {
  target: string;
  modifier: number;
  source: string;
  // Optional 5e usage condition (e.g. AC "while wearing no armor"); surfaced as
  // reminder text where the channel can't auto-apply it (#383). Omitted when absent.
  condition?: string;
}

// The minimal item shape the passive-bonus derivation needs. An item is "active"
// when equipped OR attuned; only then do its scalar add-op capabilities apply.
export interface PassiveBonusItem {
  name: string;
  equipped: boolean;
  attuned: boolean;
  capabilities: CapabilityColumns[];
}

// Gather scalar (non-dice) add-op passiveBonus capabilities from active items and
// resolve each to its modifier channel. setTo, dice-valued, and unchanneled
// targets are skipped this slice.
export function deriveItemPassiveBonuses(items: PassiveBonusItem[]): ItemPassiveContribution[] {
  const out: ItemPassiveContribution[] = [];
  for (const item of items) {
    if (!item.equipped && !item.attuned) continue;
    for (const col of item.capabilities) {
      const cap = readCapability(col);
      if (cap.kind !== "passiveBonus") continue;
      if (cap.op !== "add") continue;
      if (cap.dice) continue;
      const channel = passiveBonusChannel(cap);
      if (!channel) continue;
      out.push({
        target: channel,
        modifier: cap.value,
        source: item.name,
        ...(cap.condition ? { condition: cap.condition } : {}),
      });
    }
  }
  return out;
}

// The minimal item shape grant derivation needs. Activation gate (#545): an item
// that requires attunement is active only when attuned; otherwise when equipped.
export interface GrantItem {
  name: string;
  equipped: boolean;
  attuned: boolean;
  requiresAttunement: boolean;
  capabilities: CapabilityColumns[];
}

/** Is this item currently conferring its capabilities? (equip, or attune when required.) */
export function isItemActive(item: { equipped: boolean; attuned: boolean; requiresAttunement: boolean }): boolean {
  return item.requiresAttunement ? item.attuned : item.equipped;
}

/** One item-sourced damage resistance/immunity or condition immunity. */
export interface ItemTraitGrant {
  value: string;
  source: string;
}

/** One item-sourced advantage grant (rendered as reminder text on its surface). */
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

export interface DerivedItemGrants {
  resistances: ItemTraitGrant[];
  immunities: ItemTraitGrant[];
  conditionImmunities: ItemTraitGrant[];
  advantages: ItemAdvantageGrant[];
  proficiencies: ItemProficiencyGrant[];
}

// Per-grant-type collectors: each folds one grant capability into the matching
// bucket. resistance/immunity/conditionImmunity share the trait-grant shape.
function collectTraitGrant(bucket: ItemTraitGrant[], cap: GrantCapability, source: string) {
  if (cap.grantValue) bucket.push({ value: cap.grantValue, source });
}

function collectAdvantageGrant(out: DerivedItemGrants, cap: GrantCapability, source: string) {
  if (!cap.grantOn) return;
  // initiative/attack are whole-axis — drop any stale skill/ability qualifier.
  const wholeAxis = cap.grantOn === "initiative" || cap.grantOn === "attack";
  out.advantages.push({
    on: cap.grantOn,
    ...(!wholeAxis && cap.grantValueKind ? { valueKind: cap.grantValueKind } : {}),
    ...(!wholeAxis && cap.grantValue ? { value: cap.grantValue } : {}),
    cantBeSurprised: cap.cantBeSurprised,
    source,
    ...(cap.description ? { description: cap.description } : {}),
  });
}

function collectProficiencyGrant(out: DerivedItemGrants, cap: GrantCapability, source: string) {
  if (cap.grantValue && cap.grantValueKind && (PROFICIENCY_KINDS as readonly string[]).includes(cap.grantValueKind)) {
    out.proficiencies.push({ profType: cap.grantValueKind as ProficiencyKind, value: cap.grantValue, source });
  }
}

const GRANT_COLLECTORS: Record<GrantType, (out: DerivedItemGrants, cap: GrantCapability, source: string) => void> = {
  resistance: (out, cap, source) => collectTraitGrant(out.resistances, cap, source),
  immunity: (out, cap, source) => collectTraitGrant(out.immunities, cap, source),
  conditionImmunity: (out, cap, source) => collectTraitGrant(out.conditionImmunities, cap, source),
  advantage: collectAdvantageGrant,
  proficiency: collectProficiencyGrant,
};

// Gather every grant capability from active items into per-derivation buckets.
// resistance feeds the #456 halve channel; proficiency merges into the derived
// proficiency lists; advantage/conditionImmunity/immunity surface as flags + text.
export function deriveItemGrants(items: GrantItem[]): DerivedItemGrants {
  const out: DerivedItemGrants = {
    resistances: [],
    immunities: [],
    conditionImmunities: [],
    advantages: [],
    proficiencies: [],
  };
  for (const item of items) {
    if (!isItemActive(item)) continue;
    for (const col of item.capabilities) {
      const cap = readCapability(col);
      if (cap.kind !== "grant") continue;
      GRANT_COLLECTORS[cap.grantType]?.(out, cap, item.name);
    }
  }
  return out;
}

/** Damage types item grants make the character resistant to (fed into #456 halving). */
export function itemResistedDamageTypes(items: GrantItem[]): Set<string> {
  return new Set(deriveItemGrants(items).resistances.map((r) => r.value));
}

/** Damage types item grants make the character immune to (zeroed at damage-apply). */
export function itemImmuneDamageTypes(items: GrantItem[]): Set<string> {
  return new Set(deriveItemGrants(items).immunities.map((i) => i.value));
}

/** A concrete attunement prerequisite resolved from the snapshotted columns. */
export interface AttunementPrereq {
  kind: AttunementPrereqKind;
  value: string | null;
}

// The character facts an attunement prerequisite is checked against.
export interface AttunementSubject {
  classEntries: { name: string; subclass?: string | null }[];
  raceName: string | null;
  alignment: string | null;
}

// Human phrasing for a failed prerequisite (5e "requires attunement by a …").
export function describeAttunementPrereq(prereq: AttunementPrereq): string {
  switch (prereq.kind) {
    case "spellcaster":
      return "a spellcaster";
    case "class":
      return `a ${prereq.value ?? "specific class"}`;
    case "species":
      return `a ${prereq.value ?? "specific species"}`;
    case "alignment":
      return `a ${prereq.value ?? "specific alignment"} creature`;
  }
}

// Does the subject satisfy the prerequisite? Comparisons are case-insensitive.
// spellcaster is met when any class entry has a nonzero caster fraction.
export function meetsAttunementPrereq(prereq: AttunementPrereq, subject: AttunementSubject): boolean {
  const want = (prereq.value ?? "").trim().toLowerCase();
  switch (prereq.kind) {
    case "spellcaster":
      return subject.classEntries.some((e) => casterFractionFor(e.name, e.subclass) !== "none");
    case "class":
      return subject.classEntries.some((e) => e.name.trim().toLowerCase() === want);
    case "species":
      return (subject.raceName ?? "").trim().toLowerCase() === want;
    case "alignment":
      return (subject.alignment ?? "").trim().toLowerCase() === want;
  }
}
