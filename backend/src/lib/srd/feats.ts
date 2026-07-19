import type { AdvancementEntry } from "@/lib/classes/resources.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

/** PHB'24 feat categories (local union keeps srd/ a dependency leaf). */
export type FeatCategory = "origin" | "general" | "fighting_style" | "epic_boon";

/**
 * Whether a feat may be taken via an Ability Score Improvement slot at `level`
 * (PHB'24 pp. 87-88). Origin feats come from backgrounds and Fighting Style from
 * class features, so neither is ever offered here; General unlocks at level 4 and
 * Epic Boon at level 19 unless the feat overrides levelPrerequisite.
 */
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

/**
 * Numeric stat targets: summed by deriveFeatBonuses and applied as additive
 * bonuses in serializeCharacter. Adding a target here + a new apply site in
 * serializeCharacter is all that's needed to support it for catalog and custom feats.
 */
const NUMERIC_FEAT_IMPROVEMENT_TARGETS = [
  "initiative",
  "speed",
  "armorClass",
  "maxHp",
] as const;

export type NumericFeatImprovementTarget = (typeof NUMERIC_FEAT_IMPROVEMENT_TARGETS)[number];

/**
 * Proficiency targets: keyed improvements (imp.key identifies the specific
 * skill, ability, armor category, or weapon name/category being granted).
 * Applied by deriveFeatProficiencies rather than deriveFeatBonuses.
 */
const PROFICIENCY_FEAT_IMPROVEMENT_TARGETS = [
  "skillProficiency",
  "savingThrowProficiency",
  "armorProficiency",   // key = ArmorProficiencyCategory ("light" | "medium" | "heavy" | "shield")
  "weaponProficiency",  // key = weapon category ("Simple Weapons") or specific name ("Longswords")
] as const;

/**
 * Combat-modifier targets: not summed as flat bonuses but used to derive
 * per-attack properties at read time (e.g. raising the unarmed-strike damage die).
 * `unarmedDamageDie` stores the die face count (e.g. 4 → d4); derivation takes
 * the max across all active advancements rather than summing them.
 */
const COMBAT_FEAT_IMPROVEMENT_TARGETS = [
  "unarmedDamageDie",       // amount = die face count (e.g. 4 for d4); max across feats
  // Fighting Style feats (#1137) — situational, applied per-read, not summed as flat bonuses:
  "rangedAttackRoll",       // Archery: +amount to ranged weapon attack rolls (deriveRangedAttackRollBonus)
  "armorClassWhileArmored", // Defense: +amount to AC only while wearing body armor (buildArmorClassView)
  "offhandAbilityDamage",   // Two-Weapon Fighting: marker — add ability mod to the off-hand attack's damage
] as const;

/**
 * All valid FeatImprovement.target values. Used for route-level Zod validation.
 * Adding a new target here + wiring it in serializeCharacter is all that's needed.
 */
export const FEAT_IMPROVEMENT_TARGETS = [
  ...NUMERIC_FEAT_IMPROVEMENT_TARGETS,
  ...PROFICIENCY_FEAT_IMPROVEMENT_TARGETS,
  ...COMBAT_FEAT_IMPROVEMENT_TARGETS,
] as const;

/**
 * Sums all numeric feat improvement bonuses across a set of advancements.
 * `appliedLevel` is hitDice.total (the number of explicit level-ups applied),
 * used to scale perLevel bonuses (e.g. Tough = +2 per applied level).
 *
 * Callers pass the **already-clamped** (in-cap) advancements slice so
 * over-cap feats are automatically excluded — no reversal logic needed.
 *
 * Proficiency targets (skillProficiency, savingThrowProficiency) fall through
 * the `if (!(target in totals)) continue` guard — handled by deriveFeatProficiencies.
 */
export function deriveFeatBonuses(
  advancements: AdvancementEntry[],
  appliedLevel: number,
): Record<NumericFeatImprovementTarget, number> {
  const totals: Record<NumericFeatImprovementTarget, number> = {
    initiative: 0,
    speed: 0,
    armorClass: 0,
    maxHp: 0,
  };

  for (const entry of advancements) {
    for (const imp of (entry.improvements ?? [])) {
      const target = imp.target as NumericFeatImprovementTarget;
      if (!(target in totals)) continue; // unknown / proficiency target — skip gracefully
      // PHB'24: some bonuses (e.g. Alert's initiative) scale with proficiency bonus.
      if (imp.scaling === "proficiencyBonus") {
        totals[target] += imp.amount * proficiencyBonusForLevel(appliedLevel);
      } else {
        totals[target] += imp.perLevel ? imp.amount * appliedLevel : imp.amount;
      }
    }
  }

  return totals;
}

/**
 * Sums the Archery Fighting Style feat's `rangedAttackRoll` improvement (#1137)
 * across a set of advancements — the +2 added to ranged weapon attack rolls in
 * deriveWeaponAttackBonus. Callers pass the already-clamped slice so an over-cap
 * fs feat is excluded automatically.
 */
export function deriveRangedAttackRollBonus(advancements: AdvancementEntry[]): number {
  let total = 0;
  for (const entry of advancements) {
    for (const imp of entry.improvements ?? []) {
      if (imp.target === "rangedAttackRoll") total += imp.amount;
    }
  }
  return total;
}

/**
 * Collects proficiency grants from feat improvements across a set of advancements.
 * Returns four sets:
 *   - `skills`:       camelCase skill keys (e.g. "athletics") where `target === "skillProficiency"`
 *   - `savingThrows`: ability names (e.g. "strength") where `target === "savingThrowProficiency"`
 *   - `armor`:        ArmorProficiencyCategory values (e.g. "light") where `target === "armorProficiency"`
 *   - `weapons`:      weapon category/name strings (e.g. "Longswords") where `target === "weaponProficiency"`
 *
 * Callers pass the **already-clamped** slice so over-cap feats are excluded automatically.
 */
export function deriveFeatProficiencies(
  advancements: AdvancementEntry[],
): { skills: Set<string>; savingThrows: Set<string>; armor: Set<string>; weapons: Set<string> } {
  const skills = new Set<string>();
  const savingThrows = new Set<string>();
  const armor = new Set<string>();
  const weapons = new Set<string>();

  for (const entry of advancements) {
    for (const imp of (entry.improvements ?? [])) {
      if (!imp.key) continue;
      if (imp.target === "skillProficiency") skills.add(imp.key);
      else if (imp.target === "savingThrowProficiency") savingThrows.add(imp.key);
      else if (imp.target === "armorProficiency") armor.add(imp.key);
      else if (imp.target === "weaponProficiency") weapons.add(imp.key);
    }
  }

  return { skills, savingThrows, armor, weapons };
}
