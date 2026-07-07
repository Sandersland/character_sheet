// Item-capability adapter (#545). Mirrors readEffectSpec (effects.ts) and
// readAbilityCost (ability-cost.ts): a flat-column side-table row → a typed,
// kind-discriminated Capability. Only passiveBonus is materialized this slice;
// the reserved kinds (castSpell/charges/grant/activatedEffect) read as opaque.

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

// activatedEffect axes (#543) — mirror the ActivationType / ActivatedDuration /
// ItemResourceKind / ItemResourcePeriod schema enums.
export type ActivationType = "action" | "bonus" | "reaction" | "commandWord";
export type ActivatedDurationKind = "whileActive" | "untilRest";
export type ItemResourceKind = "perRest" | "perDay" | "atWill";
export type ItemResourcePeriod = "short" | "long" | "dawn" | "dusk";

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
  durationText?: string | null;
  description?: string | null;
}

// A reserved (not-yet-implemented) capability — surfaced as opaque so callers can
// skip it without a schema change when the real payload lands.
export interface OpaqueCapability {
  kind: Exclude<CapabilityKind, "passiveBonus" | "activatedEffect">;
  description?: string | null;
}

export type Capability = PassiveBonusCapability | ActivatedEffectCapability | OpaqueCapability;

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
  activation?: string | null;
  activatedDuration?: string | null;
  resourceKind?: string | null;
  resourcePeriod?: string | null;
  resourceCharges?: number | null;
  durationText?: string | null;
}

// Adapter over the flat capability columns — no per-kind tables. A malformed
// passiveBonus (missing target/op) reads as opaque rather than throwing.
export function readCapability(row: CapabilityColumns): Capability {
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
  if (row.kind === "activatedEffect" && row.activation && row.target && row.op) {
    return {
      kind: "activatedEffect",
      activation: row.activation as ActivationType,
      target: row.target as CapabilityTarget,
      op: row.op as CapabilityOp,
      value: row.value ?? 0,
      targetKey: row.targetKey ?? null,
      duration: row.activatedDuration === "untilRest" ? "untilRest" : "whileActive",
      resourceKind: (row.resourceKind as ItemResourceKind) ?? "atWill",
      resourcePeriod: (row.resourcePeriod as ItemResourcePeriod) ?? null,
      resourceCharges: row.resourceCharges ?? 1,
      durationText: row.durationText ?? null,
      description: row.description ?? null,
    };
  }
  return { kind: row.kind as OpaqueCapability["kind"], description: row.description ?? null };
}

// Max uses per recharge for an activatedEffect. atWill is unlimited (null = no
// cap); perRest/perDay allow resourceCharges uses (default 1) per period.
export function activatedMaxUses(cap: ActivatedEffectCapability): number | null {
  if (cap.resourceKind === "atWill") return null;
  return Math.max(1, cap.resourceCharges);
}

// The rest that recharges an activatedEffect's uses, or null when it never rests
// (atWill). perRest(short) recharges on a short rest; perRest(long) and perDay
// (dawn/dusk approximated to a rest) recharge on a long rest.
export function activatedRechargeRest(cap: ActivatedEffectCapability): "short" | "long" | null {
  if (cap.resourceKind === "atWill") return null;
  if (cap.resourceKind === "perRest" && cap.resourcePeriod === "short") return "short";
  return "long";
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
  // activatedEffect (#543) — round-tripped so the DM editor can re-populate.
  // activatedDuration matches the authoring input field name (the internal
  // Capability shape calls it `duration`).
  activation?: ActivationType;
  activatedDuration?: ActivatedDurationKind;
  resourceKind?: ItemResourceKind;
  resourcePeriod?: ItemResourcePeriod;
  resourceCharges?: number;
  durationText?: string;
}

// Serialize a capability row for the API (campaign item + inventory item alike),
// dropping nulls so the wire shape matches the optional-field DM input.
export function serializeCapability(row: CapabilityColumns): SerializedCapability {
  const cap = readCapability(row);
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
  if (cap.kind === "activatedEffect") {
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
      ...(cap.durationText ? { durationText: cap.durationText } : {}),
      ...(cap.description ? { description: cap.description } : {}),
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
