// Item-capability adapter (#545). Mirrors readEffectSpec (effects.ts) and
// readAbilityCost (ability-cost.ts): a flat-column side-table row → a typed,
// kind-discriminated Capability. passiveBonus, castSpell (#528), and grant (#529)
// are materialized; the remaining reserved kinds (charges/activatedEffect) read as opaque.

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
export const CAST_RESOURCES = ["perRestShort", "perRestLong", "perDayDawn", "perDayDusk", "atWill"] as const;
export type CastResource = (typeof CAST_RESOURCES)[number];

export const CAST_STAT_MODES = ["fixed", "wielder"] as const;
export type CastStatMode = (typeof CAST_STAT_MODES)[number];

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
export const PROFICIENCY_KINDS = ["skill", "save", "weapon", "tool", "language"] as const;
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

// A reserved (not-yet-implemented) capability — surfaced as opaque so callers can
// skip it without a schema change when the real payload lands.
export interface OpaqueCapability {
  kind: Exclude<CapabilityKind, "passiveBonus" | "castSpell" | "grant">;
  description?: string | null;
}

export type Capability = PassiveBonusCapability | CastSpellCapability | GrantCapability | OpaqueCapability;

// Number of uses a castSpell capability has per recharge period. atWill is
// unlimited (Infinity); every other resource defaults to 1 when uses is unset.
export function castUsesTotal(cap: CastSpellCapability): number {
  if (cap.resource === "atWill") return Infinity;
  return cap.uses > 0 ? cap.uses : 1;
}

// Does a castSpell resource recharge on the given rest? perRestShort recharges on
// a short OR long rest; perRestLong and the perDay dawn/dusk approximations recharge
// on a long rest only; atWill never tracks uses (nothing to reset).
export function castResourceRechargesOn(resource: string, rest: "short" | "long"): boolean {
  if (resource === "atWill") return false;
  if (resource === "perRestShort") return true; // short or long
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
  grantType?: string | null;
  grantOn?: string | null;
  grantValueKind?: string | null;
  grantValue?: string | null;
  cantBeSurprised?: boolean | null;
}

// Adapter over the flat capability columns — no per-kind tables. A malformed
// passiveBonus (missing target/op) or grant (missing grantType) reads as opaque
// rather than throwing.
export function readCapability(row: CapabilityColumns): Capability {
  if (row.kind === "castSpell" && row.spellId) {
    return {
      kind: "castSpell",
      spellId: row.spellId,
      spellName: row.spellName ?? "",
      spellLevel: row.spellLevel ?? 0,
      castLevel: row.castLevel ?? row.spellLevel ?? 0,
      resource: (row.castResource as CastResource | null) ?? "perDayDawn",
      uses: row.castUses ?? 1,
      concentration: row.castConcentration ?? false,
      dcMode: (row.dcMode as CastStatMode | null) ?? "fixed",
      dcValue: row.dcValue ?? null,
      attackMode: (row.attackMode as CastStatMode | null) ?? "fixed",
      attackValue: row.attackValue ?? null,
      description: row.description ?? null,
    };
  }
  if (row.kind === "grant" && row.grantType) {
    return {
      kind: "grant",
      grantType: row.grantType as GrantType,
      grantOn: (row.grantOn as AdvantageOn | null) ?? null,
      grantValueKind: (row.grantValueKind as GrantValueKind | null) ?? null,
      grantValue: row.grantValue ?? null,
      cantBeSurprised: row.cantBeSurprised ?? false,
      description: row.description ?? null,
    };
  }
  if (row.kind === "passiveBonus" && row.target && row.op) {
    const dice =
      row.valueDiceCount && row.valueDiceFaces
        ? { count: row.valueDiceCount, faces: row.valueDiceFaces, damageType: row.valueDamageType ?? null }
        : null;
    return {
      kind: "passiveBonus",
      target: row.target as CapabilityTarget,
      op: row.op as CapabilityOp,
      value: row.value ?? 0,
      targetKey: row.targetKey ?? null,
      condition: row.condition ?? null,
      description: row.description ?? null,
      dice,
    };
  }
  return { kind: row.kind as OpaqueCapability["kind"], description: row.description ?? null };
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
  // grant fields (#529).
  grantType?: GrantType;
  grantOn?: AdvantageOn;
  grantValueKind?: GrantValueKind;
  grantValue?: string;
  cantBeSurprised?: boolean;
}

// Serialize a capability row for the API (campaign item + inventory item alike),
// dropping nulls so the wire shape matches the optional-field DM input.
export function serializeCapability(row: CapabilityColumns): SerializedCapability {
  const cap = readCapability(row);
  if (cap.kind === "castSpell") {
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
      ...(cap.description ? { description: cap.description } : {}),
    };
  }
  if (cap.kind === "grant") {
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
  if (cap.kind === "passiveBonus") {
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
  return { kind: cap.kind, ...(cap.description ? { description: cap.description } : {}) };
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
      switch (cap.grantType) {
        case "resistance":
          if (cap.grantValue) out.resistances.push({ value: cap.grantValue, source: item.name });
          break;
        case "immunity":
          if (cap.grantValue) out.immunities.push({ value: cap.grantValue, source: item.name });
          break;
        case "conditionImmunity":
          if (cap.grantValue) out.conditionImmunities.push({ value: cap.grantValue, source: item.name });
          break;
        case "advantage":
          if (cap.grantOn) {
            // initiative/attack are whole-axis — drop any stale skill/ability qualifier.
            const wholeAxis = cap.grantOn === "initiative" || cap.grantOn === "attack";
            out.advantages.push({
              on: cap.grantOn,
              ...(!wholeAxis && cap.grantValueKind ? { valueKind: cap.grantValueKind } : {}),
              ...(!wholeAxis && cap.grantValue ? { value: cap.grantValue } : {}),
              cantBeSurprised: cap.cantBeSurprised,
              source: item.name,
              ...(cap.description ? { description: cap.description } : {}),
            });
          }
          break;
        case "proficiency":
          if (cap.grantValue && cap.grantValueKind && (PROFICIENCY_KINDS as readonly string[]).includes(cap.grantValueKind)) {
            out.proficiencies.push({ profType: cap.grantValueKind as ProficiencyKind, value: cap.grantValue, source: item.name });
          }
          break;
      }
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
