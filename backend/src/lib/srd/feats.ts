import { z } from "zod";

import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { FeatImprovement } from "@/lib/classes/resources-state.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { bothWeaponsLight } from "@/lib/srd/weapon-damage.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// PHB'24 feat categories (local union keeps srd/ a dependency leaf).
export type FeatCategory = "origin" | "general" | "fighting_style" | "epic_boon";

// PHB'24 pp. 87-88 draws this taxonomy; PHB'14's every-feat-is-general-with-no-level-gate rule (p.165) is encoded by 2014's Feat rows carrying category: "general" with a NULL levelPrerequisite,
// so the `general` branch's `?? 4` default already IS the 2014 rule. Edition-invariant (#1310) — `origin`/`fighting_style`/`epic_boon` rows are all EDITION_2024-tagged.
export function featOfferedForAsiSlot(
  feat: { category: FeatCategory; levelPrerequisite?: number | null },
  level: number,
): boolean {
  switch (feat.category) {
    case "origin":
    case "fighting_style":
      return false;
    case "general":
      return level >= (feat.levelPrerequisite ?? 4);
    case "epic_boon":
      return level >= (feat.levelPrerequisite ?? 19);
    default:
      return false; // unknown future category — fail safe-closed, never leak feats
  }
}

// SRD 5.2 p. 47: no per-class subset — any class with the Fighting Style feature may take any of the four 2024 styles.
// PHB'14 p. 72/82/91: `feat.classes` carries the per-class subset (Fighter all six; Paladin Defense/Dueling/Great Weapon Fighting/Protection; Ranger Archery/Defense/Dueling/Two-Weapon Fighting); empty means unrestricted. Matched case-insensitively.
// Multiclass `classNames` is the UNION of what each class offers — a 2014 Fighter1/Paladin2 sees every style either class grants (#1495).
export function fightingStyleFeatOfferedForClasses(
  feat: { classes: readonly string[] },
  classNames: readonly string[],
  edition: RulesEdition,
): boolean {
  switch (edition) {
    case "EDITION_2024":
      return true;
    case "EDITION_2014": {
      if (feat.classes.length === 0) return true;
      const wanted = new Set(classNames.map((c) => c.trim().toLowerCase()));
      return feat.classes.some((c) => wanted.has(c.trim().toLowerCase()));
    }
    default: {
      const exhaustive: never = edition;
      throw new Error(`fightingStyleFeatOfferedForClasses: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Summed by deriveFeatBonuses, applied in serializeCharacter — add a target
// here plus an apply site there.
const NUMERIC_FEAT_IMPROVEMENT_TARGETS = [
  "initiative",
  "speed",
  "armorClass",
  "maxHp",
] as const;

export type NumericFeatImprovementTarget = (typeof NUMERIC_FEAT_IMPROVEMENT_TARGETS)[number];

// Keyed by imp.key (skill/ability/armor/weapon); applied by
// deriveFeatProficiencies, not deriveFeatBonuses.
const PROFICIENCY_FEAT_IMPROVEMENT_TARGETS = [
  "skillProficiency",
  "savingThrowProficiency",
  "armorProficiency",   // key = ArmorProficiencyCategory ("light" | "medium" | "heavy" | "shield")
  "weaponProficiency",  // key = weapon category ("Simple Weapons") or specific name ("Longswords")
] as const;

// Derived at read time, not summed as flat bonuses (e.g. unarmedDamageDie is
// a die face count, max across advancements).
const COMBAT_FEAT_IMPROVEMENT_TARGETS = [
  "unarmedDamageDie",       // amount = die face count (e.g. 4 for d4); max across feats
  "rangedAttackRoll",       // Archery: +amount to ranged weapon attack rolls (deriveRangedAttackRollBonus)
  "armorClassWhileArmored", // Defense: +amount to AC only while wearing body armor (buildArmorClassView)
  "offhandAbilityDamage",   // Two-Weapon Fighting: marker — add ability mod to the off-hand attack's damage
] as const;

// Add a target here plus wire it in serializeCharacter — nothing else needed.
export const FEAT_IMPROVEMENT_TARGETS = [
  ...NUMERIC_FEAT_IMPROVEMENT_TARGETS,
  ...PROFICIENCY_FEAT_IMPROVEMENT_TARGETS,
  ...COMBAT_FEAT_IMPROVEMENT_TARGETS,
] as const;

const KEYED_FEAT_IMPROVEMENT_TARGETS: readonly string[] = PROFICIENCY_FEAT_IMPROVEMENT_TARGETS;

// Single schema reused by taken-feat snapshots, seeded ClassFeature rows (classFeatureSeedSchema), and SpeciesTrait.improvements (#1682) — never forked.
export const featImprovementSchema = z
  .object({
    target: z.enum(FEAT_IMPROVEMENT_TARGETS),
    amount: z.number().int(),
    perLevel: z.boolean().optional(),
    key: z.string().optional(),
    scaling: z.literal("proficiencyBonus").optional(),
  })
  .refine((imp) => (KEYED_FEAT_IMPROVEMENT_TARGETS.includes(imp.target) ? !!imp.key : true), {
    message: "FeatImprovement: 'key' is required for proficiency targets (skill, savingThrow, armor, weapon)",
  });

// Shared evaluator that deriveFeatBonuses and applyFeatLayer both reduce to —
// every improvements[] source shares this instead of re-deriving scaling rules.
export function deriveImprovementBonuses(
  improvements: FeatImprovement[],
  appliedLevel: number,
): Record<NumericFeatImprovementTarget, number> {
  const totals: Record<NumericFeatImprovementTarget, number> = {
    initiative: 0,
    speed: 0,
    armorClass: 0,
    maxHp: 0,
  };

  for (const imp of improvements) {
    const target = imp.target as NumericFeatImprovementTarget;
    if (!(target in totals)) continue; // unknown / proficiency target — skip gracefully
    // PHB'24: e.g. Alert's initiative bonus scales with proficiency bonus.
    if (imp.scaling === "proficiencyBonus") {
      totals[target] += imp.amount * proficiencyBonusForLevel(appliedLevel);
    } else {
      totals[target] += imp.perLevel ? imp.amount * appliedLevel : imp.amount;
    }
  }

  return totals;
}

// Set membership is the dedup — a proficiency granted by two sources collapses to one entry, letting applyFeatLayer merge without reconciling two result sets.
export function deriveImprovementProficiencies(
  improvements: FeatImprovement[],
): { skills: Set<string>; savingThrows: Set<string>; armor: Set<string>; weapons: Set<string> } {
  const skills = new Set<string>();
  const savingThrows = new Set<string>();
  const armor = new Set<string>();
  const weapons = new Set<string>();

  for (const imp of improvements) {
    if (!imp.key) continue;
    if (imp.target === "skillProficiency") skills.add(imp.key);
    else if (imp.target === "savingThrowProficiency") savingThrows.add(imp.key);
    else if (imp.target === "armorProficiency") armor.add(imp.key);
    else if (imp.target === "weaponProficiency") weapons.add(imp.key);
  }

  return { skills, savingThrows, armor, weapons };
}

// `appliedLevel` is hitDice.total, for perLevel bonuses (e.g. Tough = +2/level).
// Callers must pass the already-clamped advancements slice so over-cap feats are excluded.
export function deriveFeatBonuses(
  advancements: AdvancementEntry[],
  appliedLevel: number,
): Record<NumericFeatImprovementTarget, number> {
  return deriveImprovementBonuses(advancements.flatMap((entry) => entry.improvements ?? []), appliedLevel);
}

// buildArmorClassView applies these only while body armor is worn (#1137);
// callers must pass the already-clamped slice.
export function deriveArmoredArmorClassParts(
  advancements: AdvancementEntry[],
): { label: string; value: number }[] {
  const parts: { label: string; value: number }[] = [];
  for (const entry of advancements) {
    for (const imp of entry.improvements ?? []) {
      if (imp.target === "armorClassWhileArmored" && imp.amount !== 0) {
        parts.push({ label: entry.featName ?? "Fighting Style", value: imp.amount });
      }
    }
  }
  return parts;
}

// Feeds deriveWeaponAttackBonus (#1137); callers must pass the already-clamped slice.
export function deriveRangedAttackRollBonus(advancements: AdvancementEntry[]): number {
  let total = 0;
  for (const entry of advancements) {
    for (const imp of entry.improvements ?? []) {
      if (imp.target === "rangedAttackRoll") total += imp.amount;
    }
  }
  return total;
}

// Two required conditions: (1) Two-Weapon Fighting style taken — `offhandAbilityDamage` is a presence marker, not summed (amount carries no meaning); callers must pass the already-clamped slice.
// (2) Both equipped weapons have Light (`bothWeaponsLight`) — PHB'14 p. 195/72 and SRD 5.2 agree the style's bonus never waives that requirement (#1496, #1640).
export function hasOffHandAbilityDamage(
  advancements: AdvancementEntry[],
  weapons: ReadonlyArray<{ light: boolean }>,
): boolean {
  const styleTaken = advancements.some((entry) =>
    (entry.improvements ?? []).some((imp) => imp.target === "offhandAbilityDamage"),
  );
  return styleTaken && bothWeaponsLight(weapons);
}

// skills/savingThrows/armor/weapons <- skillProficiency/savingThrowProficiency/armorProficiency/weaponProficiency. Callers must pass the already-clamped slice.
export function deriveFeatProficiencies(
  advancements: AdvancementEntry[],
): { skills: Set<string>; savingThrows: Set<string>; armor: Set<string>; weapons: Set<string> } {
  return deriveImprovementProficiencies(advancements.flatMap((entry) => entry.improvements ?? []));
}
