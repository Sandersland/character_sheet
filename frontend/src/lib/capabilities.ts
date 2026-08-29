import { abilityLabel, skillLabel } from "@/lib/abilities";
import { formatModifier } from "@/lib/abilities";
import { conditionLabel } from "@/lib/conditions";
import { damageTypeLabel } from "@/lib/damageTypes";
import type {
  AdvantageOn,
  AttunementPrereqKind,
  CapabilityKind,
  CapabilityOp,
  CapabilityTarget,
  CastResource,
  CastStatMode,
  ChargeTrigger,
  GrantType,
  GrantValueKind,
  ItemAdvantageGrant,
  ItemCapability,
  ProficiencyKind,
} from "@/types/character";

// keyed targets resolve targetKey through the ability/skill label helpers below — never a raw key.
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

export const CAPABILITY_TARGET_OPTIONS: readonly { value: CapabilityTarget; label: string }[] = (
  Object.keys(TARGET_LABELS) as CapabilityTarget[]
).map((value) => ({ value, label: TARGET_LABELS[value] }));

export const CAPABILITY_OP_OPTIONS: readonly { value: CapabilityOp; label: string }[] = [
  { value: "add", label: "Add" },
  { value: "setTo", label: "Set to" },
];

// activatedEffect isn't authorable yet — omitted from this list.
export const CAPABILITY_KIND_OPTIONS: readonly { value: CapabilityKind; label: string }[] = [
  { value: "passiveBonus", label: "Passive bonus" },
  { value: "castSpell", label: "Cast a spell" },
  { value: "grant", label: "Grant (resistance/advantage/…)" },
  { value: "charges", label: "Charges pool" },
];

export const CAST_RESOURCE_OPTIONS: readonly { value: CastResource; label: string }[] = [
  { value: "perRestShort", label: "1×/short rest" },
  { value: "perRestLong", label: "1×/long rest" },
  { value: "perDayDawn", label: "1×/day (dawn)" },
  { value: "perDayDusk", label: "1×/day (dusk)" },
  { value: "atWill", label: "At will" },
  { value: "charges", label: "Spends item charges" },
];

// dawn/dusk approximate to a long rest (#555).
export const CHARGE_TRIGGER_OPTIONS: readonly { value: ChargeTrigger; label: string }[] = [
  { value: "dawn", label: "At dawn" },
  { value: "dusk", label: "At dusk" },
  { value: "short", label: "On a short rest" },
  { value: "long", label: "On a long rest" },
];

export const CAST_STAT_MODE_OPTIONS: readonly { value: CastStatMode; label: string }[] = [
  { value: "fixed", label: "Fixed value" },
  { value: "wielder", label: "Wielder's own" },
];

export function castSpellSummary(cap: ItemCapability): string {
  const name = cap.spellName ?? "spell";
  const dc = cap.dcMode === "wielder" ? "wielder DC" : cap.dcValue != null ? `DC ${cap.dcValue}` : "";
  const resource =
    cap.resource === "charges"
      ? `costs ${cap.chargeCost ?? 1} charge${(cap.chargeCost ?? 1) === 1 ? "" : "s"}`
      : (CAST_RESOURCE_OPTIONS.find((o) => o.value === cap.resource)?.label ?? "");
  return [`Casts ${name}`, resource, dc].filter(Boolean).join(" · ");
}

function chargesSummary(cap: ItemCapability): string {
  if (cap.maxCharges == null) return cap.description ?? "Charges";
  const count = `${cap.maxCharges} charge${cap.maxCharges === 1 ? "" : "s"}`;
  const trigger = CHARGE_TRIGGER_OPTIONS.find((o) => o.value === cap.recharge?.trigger)?.label.toLowerCase() ?? "at dawn";
  const dice = cap.recharge?.dice;
  const bonus = cap.recharge?.bonus;
  const regain = dice
    ? `regains ${dice.count}d${dice.faces}${bonus ? `+${bonus}` : ""}`
    : bonus
      ? `regains ${bonus}`
      : "refills";
  return `${count} · ${regain} ${trigger}`;
}

export const ATTUNEMENT_PREREQ_OPTIONS: readonly { value: AttunementPrereqKind | ""; label: string }[] = [
  { value: "", label: "Anyone" },
  { value: "class", label: "A class" },
  { value: "spellcaster", label: "A spellcaster" },
  { value: "species", label: "A species" },
  { value: "alignment", label: "An alignment" },
];

export function targetUsesAbilityKey(target: CapabilityTarget): boolean {
  return target === "save" || target === "abilityScore";
}

export function targetUsesSkillKey(target: CapabilityTarget): boolean {
  return target === "skill";
}

function targetPhrase(cap: ItemCapability): string {
  if (!cap.target) return "";
  if (targetUsesSkillKey(cap.target) && cap.targetKey) return skillLabel(cap.targetKey);
  if (targetUsesAbilityKey(cap.target) && cap.targetKey) {
    return cap.target === "save" ? `${abilityLabel(cap.targetKey)} save` : abilityLabel(cap.targetKey);
  }
  return TARGET_LABELS[cap.target];
}

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

function grantValueLabel(kind: GrantValueKind | undefined, value: string): string {
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
      // initiative/attack are whole-axis — ignore any stale skill/ability qualifier.
      const wholeAxis = cap.grantOn === "initiative" || cap.grantOn === "attack";
      const core = value && !wholeAxis ? `Advantage on ${on} (${value})` : `Advantage on ${on}`;
      return cap.cantBeSurprised ? `${core}; can't be surprised` : core;
    }
    default:
      return cap.description ?? cap.grantType;
  }
}

export function advantageGrantSummary(grant: ItemAdvantageGrant): string {
  const on = ADVANTAGE_ON_OPTIONS.find((o) => o.value === grant.on)?.label ?? "rolls";
  // initiative/attack are whole-axis — ignore any stale skill/ability qualifier.
  const wholeAxis = grant.on === "initiative" || grant.on === "attack";
  const value = grant.value && !wholeAxis ? grantValueLabel(grant.valueKind, grant.value) : "";
  const core = value ? `Advantage on ${on} (${value})` : `Advantage on ${on}`;
  return grant.cantBeSurprised ? `${core}; can't be surprised` : core;
}

export function capabilitySummary(cap: ItemCapability): string {
  if (cap.kind === "castSpell") return castSpellSummary(cap);
  if (cap.kind === "grant") return grantSummary(cap);
  if (cap.kind === "charges") return chargesSummary(cap);
  if (cap.kind !== "passiveBonus") return cap.description ?? cap.kind;
  const core = `${valuePhrase(cap)} ${targetPhrase(cap)}`.trim();
  return cap.condition ? `${core} (when ${cap.condition})` : core;
}
