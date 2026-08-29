import { ABILITY_OPTIONS, SKILL_OPTIONS } from "@/lib/abilities";
import { targetUsesAbilityKey, targetUsesSkillKey } from "@/lib/capabilities";
import type {
  CapabilityKind,
  CapabilityTarget,
  CatalogSpell,
  GrantType,
  ItemCapability,
  ProficiencyKind,
} from "@/types/character";

export const NEW_PASSIVE: ItemCapability = { kind: "passiveBonus", target: "ac", op: "add", value: 1 };
export const NEW_CAST: ItemCapability = {
  kind: "castSpell",
  resource: "perRestShort",
  uses: 1,
  dcMode: "fixed",
  dcValue: 13,
  attackMode: "fixed",
  attackValue: 5,
};
const NEW_GRANT: ItemCapability = {
  kind: "grant",
  grantType: "resistance",
  grantValueKind: "damageType",
  grantValue: "fire",
};
const NEW_CHARGES: ItemCapability = {
  kind: "charges",
  maxCharges: 7,
  recharge: { trigger: "dawn", dice: { count: 1, faces: 6 }, bonus: 1 },
};

export function draftForKind(kind: CapabilityKind): ItemCapability {
  const next =
    kind === "castSpell" ? NEW_CAST : kind === "grant" ? NEW_GRANT : kind === "charges" ? NEW_CHARGES : NEW_PASSIVE;
  return { ...next };
}

export function keyOptions(target: CapabilityTarget): readonly { key: string; label: string }[] {
  if (targetUsesSkillKey(target)) return SKILL_OPTIONS;
  if (targetUsesAbilityKey(target)) return ABILITY_OPTIONS;
  return [];
}

export function applySpell(cap: ItemCapability, spell: CatalogSpell): Partial<ItemCapability> {
  const needsDc = spell.attackType === "save";
  const needsAttack = spell.attackType === "attack";
  return {
    spellId: spell.id,
    spellName: spell.name,
    spellLevel: spell.level,
    castLevel: spell.level,
    concentration: spell.concentration ?? false,
    dcMode: needsDc ? (cap.dcMode ?? "fixed") : "fixed",
    dcValue: needsDc ? (cap.dcValue ?? 13) : undefined,
    attackMode: needsAttack ? (cap.attackMode ?? "fixed") : "fixed",
    attackValue: needsAttack ? (cap.attackValue ?? 5) : undefined,
  };
}

export function applyTarget(cap: ItemCapability, target: CapabilityTarget): Partial<ItemCapability> {
  const opts = keyOptions(target);
  const targetKey =
    opts.length > 0 ? (opts.some((o) => o.key === cap.targetKey) ? cap.targetKey : opts[0].key) : undefined;
  return { target, targetKey };
}

export function applyDiceToggle(useDice: boolean): Partial<ItemCapability> {
  return useDice ? { dice: { count: 1, faces: 6 }, value: undefined } : { dice: undefined, value: 1 };
}

export function applyGrantType(grantType: GrantType): Partial<ItemCapability> {
  const defaults: Record<GrantType, Partial<ItemCapability>> = {
    resistance: { grantValueKind: "damageType", grantValue: "fire", grantOn: undefined, cantBeSurprised: undefined },
    immunity: { grantValueKind: "damageType", grantValue: "fire", grantOn: undefined, cantBeSurprised: undefined },
    conditionImmunity: { grantValueKind: "condition", grantValue: "poisoned", grantOn: undefined, cantBeSurprised: undefined },
    advantage: { grantOn: "check", grantValueKind: "skill", grantValue: "perception", cantBeSurprised: false },
    proficiency: { grantValueKind: "skill", grantValue: "perception", grantOn: undefined, cantBeSurprised: undefined },
  };
  return { grantType, ...defaults[grantType] };
}

export function applyProfKind(profKind: ProficiencyKind): Partial<ItemCapability> {
  const value = profKind === "skill" ? "perception" : profKind === "save" ? "strength" : "";
  return { grantValueKind: profKind, grantValue: value };
}

// initiative/attack are whole-axis (no qualifier); check is per-skill, save per-ability — never keeps a stale key.
export function applyAdvantageOn(grantOn: ItemCapability["grantOn"]): Partial<ItemCapability> {
  const wholeAxis = grantOn === "initiative" || grantOn === "attack";
  const qualifier = wholeAxis
    ? { grantValueKind: undefined, grantValue: undefined }
    : { grantValueKind: grantOn === "save" ? ("save" as const) : ("skill" as const), grantValue: undefined };
  return { grantOn, ...qualifier };
}
