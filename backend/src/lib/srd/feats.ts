import { z } from "zod";

import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { FeatImprovement } from "@/lib/classes/resources-state.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { bothWeaponsLight } from "@/lib/srd/weapon-damage.js";

/** PHB'24 feat categories (local union keeps srd/ a dependency leaf). */
export type FeatCategory = "origin" | "general" | "fighting_style" | "epic_boon";

/**
 * Whether a feat may be taken via an Ability Score Improvement slot at `level`.
 * Origin feats come from backgrounds and Fighting Style from class features, so
 * neither is ever offered here; General unlocks at level 4 and Epic Boon at
 * level 19 unless the feat overrides levelPrerequisite.
 *
 * Edition-invariant (#1310): PHB'24 pp. 87-88 draws this exact taxonomy, and
 * PHB'14's every-feat-is-general-with-no-level-gate rule (p.165, earliest ASI
 * at level 4 in any 2014 class) is faithfully encoded by 2014's Feat rows
 * carrying `category: "general"` with a NULL levelPrerequisite — so the
 * `general` branch's `?? 4` default already IS the 2014 rule, with no fork
 * needed. `origin`/`fighting_style`/`epic_boon` rows are all EDITION_2024-tagged,
 * so a 2014 character can never reach those branches at all. No `edition`
 * parameter, per CLAUDE.md: "an edition-invariant rule takes no edition."
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

const KEYED_FEAT_IMPROVEMENT_TARGETS: readonly string[] = PROFICIENCY_FEAT_IMPROVEMENT_TARGETS;

/**
 * The ONE FeatImprovement zod schema (#1691) — validates a taken feat's
 * `improvements` snapshot (POST .../advancement/transactions, routes/character/
 * advancement.ts) AND a seeded ClassFeature row's `improvements` column
 * (prisma/seed/class-features.ts's classFeatureSeedSchema) against the SAME
 * FEAT_IMPROVEMENT_TARGETS vocabulary. Reused, never forked — a target added
 * here is immediately valid for both a player-taken feat and a class/subclass
 * passive row, and #1682's SpeciesTrait.improvements is a third reuse of it.
 */
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

/**
 * Sums numeric improvement bonuses over a flat list — the shared arithmetic
 * deriveFeatBonuses (below, a taken feat's advancements) and the ClassFeature
 * row layer (serialize/classes.ts's applyFeatLayer) both reduce to. Split out
 * so every improvements[] source (feat snapshot, class/subclass feature row,
 * #1682's future SpeciesTrait row) shares one evaluator instead of
 * re-deriving the scaling rules per source.
 */
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
    // PHB'24: some bonuses (e.g. Alert's initiative) scale with proficiency bonus.
    if (imp.scaling === "proficiencyBonus") {
      totals[target] += imp.amount * proficiencyBonusForLevel(appliedLevel);
    } else {
      totals[target] += imp.perLevel ? imp.amount * appliedLevel : imp.amount;
    }
  }

  return totals;
}

/**
 * Collects proficiency grants over a flat improvements list — the
 * deriveImprovementBonuses twin for the four keyed proficiency targets. Set
 * membership IS the dedup: a proficiency named by two different sources
 * (e.g. a feat AND a class feature row) collapses to one entry with no
 * separate dedup step, which is what lets applyFeatLayer merge both sources
 * through this ONE call rather than reconciling two result sets.
 */
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
  return deriveImprovementBonuses(advancements.flatMap((entry) => entry.improvements ?? []), appliedLevel);
}

/**
 * Labeled AC addends from the Defense Fighting Style feat's `armorClassWhileArmored`
 * improvement (#1137) — one part per contributing feat, labeled with its snapshot
 * name. The caller (buildArmorClassView) applies these only while body armor is
 * worn. Callers pass the already-clamped slice so an over-cap fs feat is excluded.
 */
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
 * Whether the off-hand attack keeps its governing ability modifier — the flag
 * `deriveOffHandDamage` reads. Two conditions, both required:
 *   1. The Two-Weapon Fighting fighting style is taken (#1137 turned fighting
 *      styles into feats, so its `offhandAbilityDamage` improvement is the
 *      marker; a presence check, not a sum — the improvement's `amount`
 *      carries no meaning). Callers pass the already-clamped slice so an
 *      over-cap style feat is excluded automatically.
 *   2. Both equipped weapons have the Light property (`bothWeaponsLight`) —
 *      PHB'14 p. 195 / p. 72 and SRD 5.2 agree the style's damage bonus never
 *      waives the two-Light-weapons requirement (#1496, #1640). Without it, a
 *      non-Light pair wrongly kept the full ability modifier on the served
 *      off-hand row.
 */
export function hasOffHandAbilityDamage(
  advancements: AdvancementEntry[],
  weapons: ReadonlyArray<{ light: boolean }>,
): boolean {
  const styleTaken = advancements.some((entry) =>
    (entry.improvements ?? []).some((imp) => imp.target === "offhandAbilityDamage"),
  );
  return styleTaken && bothWeaponsLight(weapons);
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
  return deriveImprovementProficiencies(advancements.flatMap((entry) => entry.improvements ?? []));
}
