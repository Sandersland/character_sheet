// Item-capability adapter (#545). Mirrors readEffectSpec (effects.ts) and
// readAbilityCost (ability-cost.ts): a flat-column side-table row → a typed,
// kind-discriminated Capability. Only passiveBonus is materialized this slice;
// the reserved kinds (castSpell/charges/grant/activatedEffect) read as opaque.

import { casterFractionFor } from "./srd.js";

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

// A reserved (not-yet-implemented) capability — surfaced as opaque so callers can
// skip it without a schema change when the real payload lands.
export interface OpaqueCapability {
  kind: Exclude<CapabilityKind, "passiveBonus">;
  description?: string | null;
}

export type Capability = PassiveBonusCapability | OpaqueCapability;

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
  return { kind: row.kind as OpaqueCapability["kind"], description: row.description ?? null };
}

// The buffsByTarget channel key a scalar passiveBonus contributes to, or null
// when the target isn't yet wired into a per-target modifier channel: ac (#383),
// dice→damage (#526C), and save/abilityScore/spell*/initiative/speed/maxHp
// (later slices). Reuses the same channel keys active buffs already use so item
// bonuses and cast buffs sum together on read.
export function passiveBonusChannel(cap: PassiveBonusCapability): string | null {
  switch (cap.target) {
    case "skill":
      return cap.targetKey ?? null;
    case "damage":
      return "meleeDamage";
    case "attack":
      return "attackRoll";
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
      out.push({ target: channel, modifier: cap.value, source: item.name });
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
