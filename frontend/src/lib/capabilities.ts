import { abilityLabel, skillLabel } from "@/lib/abilities";
import { formatModifier } from "@/lib/abilities";
import { conditionLabel } from "@/lib/conditions";
import { damageTypeLabel } from "@/lib/damageTypes";
import type {
  AdvantageOn,
  AttunementPrereqKind,
  CapabilityOp,
  CapabilityTarget,
  GrantType,
  GrantValueKind,
  ItemAdvantageGrant,
  ItemCapability,
  ProficiencyKind,
} from "@/types/character";

// Fixed display labels for each passiveBonus target. A `keyed` target draws its
// specifics from targetKey, resolved through the ability/skill label helpers
// (never a raw key) in capabilitySummary below.
const TARGET_LABELS: Record<CapabilityTarget, string> = {
  ac: "AC",
  attack: "Attack rolls",
  damage: "Damage",
  save: "Saving throw",
  skill: "Skill",
  abilityScore: "Ability score",
  spellAttack: "Spell attack",
  spellDc: "Spell save DC",
  initiative: "Initiative",
  speed: "Speed",
  maxHp: "Max HP",
};

// Canonical target order for the authoring picker.
export const CAPABILITY_TARGET_OPTIONS: readonly { value: CapabilityTarget; label: string }[] = (
  Object.keys(TARGET_LABELS) as CapabilityTarget[]
).map((value) => ({ value, label: TARGET_LABELS[value] }));

export const CAPABILITY_OP_OPTIONS: readonly { value: CapabilityOp; label: string }[] = [
  { value: "add", label: "Add" },
  { value: "setTo", label: "Set to" },
];

export const ATTUNEMENT_PREREQ_OPTIONS: readonly { value: AttunementPrereqKind | ""; label: string }[] = [
  { value: "", label: "Anyone" },
  { value: "class", label: "A class" },
  { value: "spellcaster", label: "A spellcaster" },
  { value: "species", label: "A species" },
  { value: "alignment", label: "An alignment" },
];

/** A save or ability-score target names an ability via targetKey. */
export function targetUsesAbilityKey(target: CapabilityTarget): boolean {
  return target === "save" || target === "abilityScore";
}

/** A skill target names a skill via targetKey. */
export function targetUsesSkillKey(target: CapabilityTarget): boolean {
  return target === "skill";
}

// The specific "what" a capability affects, resolving targetKey through the
// label helpers — e.g. skill → "Stealth", save → "Dexterity save".
function targetPhrase(cap: ItemCapability): string {
  if (!cap.target) return "";
  if (targetUsesSkillKey(cap.target) && cap.targetKey) return skillLabel(cap.targetKey);
  if (targetUsesAbilityKey(cap.target) && cap.targetKey) {
    return cap.target === "save" ? `${abilityLabel(cap.targetKey)} save` : abilityLabel(cap.targetKey);
  }
  return TARGET_LABELS[cap.target];
}

// The bonus magnitude: a dice roll (e.g. "+2d6 fire") or a signed/absolute scalar.
function valuePhrase(cap: ItemCapability): string {
  if (cap.dice) {
    const dice = `${cap.dice.count}d${cap.dice.faces}`;
    const typed = cap.dice.damageType ? `${dice} ${cap.dice.damageType}` : dice;
    return cap.op === "setTo" ? typed : `+${typed}`;
  }
  const value = cap.value ?? 0;
  return cap.op === "setTo" ? `set to ${value}` : formatModifier(value);
}

export const GRANT_TYPE_OPTIONS: readonly { value: GrantType; label: string }[] = [
  { value: "resistance", label: "Resistance" },
  { value: "immunity", label: "Damage immunity" },
  { value: "conditionImmunity", label: "Condition immunity" },
  { value: "advantage", label: "Advantage" },
  { value: "proficiency", label: "Proficiency" },
];

export const ADVANTAGE_ON_OPTIONS: readonly { value: AdvantageOn; label: string }[] = [
  { value: "check", label: "Ability check" },
  { value: "save", label: "Saving throw" },
  { value: "initiative", label: "Initiative" },
  { value: "attack", label: "Attack roll" },
];

export const PROFICIENCY_KIND_OPTIONS: readonly { value: ProficiencyKind; label: string }[] = [
  { value: "skill", label: "Skill" },
  { value: "save", label: "Saving throw" },
  { value: "weapon", label: "Weapon" },
  { value: "tool", label: "Tool" },
  { value: "language", label: "Language" },
];

// Resolve a grant value (damage type / condition / skill / ability key) through
// the right label helper — never a raw key. Free-text values pass through as-is.
export function grantValueLabel(kind: GrantValueKind | undefined, value: string): string {
  switch (kind) {
    case "damageType":
      return damageTypeLabel(value);
    case "condition":
      return conditionLabel(value);
    case "skill":
      return skillLabel(value);
    case "ability":
      return abilityLabel(value);
    case "save":
      return `${abilityLabel(value)} save`;
    default:
      return value;
  }
}

/** One-line human summary of a grant capability, resolved through label helpers. */
export function grantSummary(cap: ItemCapability): string {
  if (cap.kind !== "grant" || !cap.grantType) return cap.description ?? cap.kind;
  const value = cap.grantValue ? grantValueLabel(cap.grantValueKind, cap.grantValue) : "";
  switch (cap.grantType) {
    case "resistance":
      return `Resistance to ${value}`;
    case "immunity":
      return `Immunity to ${value}`;
    case "conditionImmunity":
      return `Immune to ${value}`;
    case "proficiency":
      return `Proficiency: ${value}`;
    case "advantage": {
      const on = ADVANTAGE_ON_OPTIONS.find((o) => o.value === cap.grantOn)?.label ?? "rolls";
      const core = value ? `Advantage on ${on} (${value})` : `Advantage on ${on}`;
      return cap.cantBeSurprised ? `${core}; can't be surprised` : core;
    }
    default:
      return cap.description ?? cap.grantType;
  }
}

/** Reminder text for an item-granted advantage on the relevant sheet surface. */
export function advantageGrantSummary(grant: ItemAdvantageGrant): string {
  const on = ADVANTAGE_ON_OPTIONS.find((o) => o.value === grant.on)?.label ?? "rolls";
  const value = grant.value ? grantValueLabel(grant.valueKind, grant.value) : "";
  const core = value ? `Advantage on ${on} (${value})` : `Advantage on ${on}`;
  return grant.cantBeSurprised ? `${core}; can't be surprised` : core;
}

/** One-line human summary, e.g. "+2 Stealth", "+2d6 fire Damage (when on hit)". */
export function capabilitySummary(cap: ItemCapability): string {
  if (cap.kind === "grant") return grantSummary(cap);
  if (cap.kind !== "passiveBonus") return cap.description ?? cap.kind;
  const core = `${valuePhrase(cap)} ${targetPhrase(cap)}`.trim();
  return cap.condition ? `${core} (when ${cap.condition})` : core;
}

/** 5e phrasing for an attunement prerequisite (mirrors backend describeAttunementPrereq). */
export function describeAttunementPrereq(
  kind: AttunementPrereqKind,
  value?: string | null,
): string {
  switch (kind) {
    case "spellcaster":
      return "a spellcaster";
    case "class":
      return `a ${value ?? "specific class"}`;
    case "species":
      return `a ${value ?? "specific species"}`;
    case "alignment":
      return `a ${value ?? "specific alignment"} creature`;
  }
}
