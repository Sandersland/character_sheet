import type { RollEventAttackComponents } from "@character-sheet/shared-types";

import type { ArmorCategory, ItemCategory } from "@/lib/inventory/item-detail-inputs.js";
import { abilityModifier } from "@/lib/srd/math.js";

export type ArmorProficiencyCategory = "light" | "medium" | "heavy" | "shield";

export function isProficientWithWeapon(
  weapon: { name: string; weaponClass?: string | null },
  grants: ReadonlyArray<{ name: string }>,
): boolean {
  const lcName = weapon.name.toLowerCase();
  for (const grant of grants) {
    if (grant.name === "Simple Weapons" && weapon.weaponClass === "simple") return true;
    if (grant.name === "Martial Weapons" && weapon.weaponClass === "martial") return true;
    // Specific weapon: grants are plural ("Longswords"), catalog names are singular.
    const grantSingular = grant.name.toLowerCase().replace(/s$/, "");
    if (grantSingular === lcName) return true;
  }
  return false;
}

// Armor grants are category-keyed only — no specific-name fallback like
// isProficientWithWeapon has.
export function isProficientWithArmor(
  armorCategory: ArmorCategory | null | undefined,
  grants: ReadonlyArray<{ category: string }>,
): boolean {
  if (!armorCategory) return true;
  return grants.some((grant) => grant.category === armorCategory);
}

// An item with no derivable requirement (gear, consumable, unclassified weapon/armor) is reported proficient — a no-warn display policy, not a rules claim.
// PHB'14 p.144–145 / SRD 5.2 (Equipment): proficiency is edition-invariant, matched by category or name against granted proficiencies.
export function isProficientWithItem(
  item: {
    category: ItemCategory;
    name: string;
    weaponClass?: string | null;
    armorCategory?: ArmorCategory | null;
  },
  weaponGrants: ReadonlyArray<{ name: string }>,
  armorGrants: ReadonlyArray<{ category: string }>,
): boolean {
  if (item.category === "weapon") {
    // The no-warn default lives here, not in isProficientWithWeapon, which must return false for an unclassified weapon so deriveWeaponAttackComponents withholds the proficiency bonus.
    if (!item.weaponClass) return true;
    return isProficientWithWeapon(item, weaponGrants);
  }
  if (item.category === "armor") return isProficientWithArmor(item.armorCategory, armorGrants);
  return true;
}

// 5e PHB (both editions agree): ranged weapons use DEX, finesse weapons the higher of STR/DEX, all other melee weapons STR. The decision lives here only — callers destructure rather than re-deriving it.
export function weaponAbilityMod(
  weapon: { finesse: boolean; weaponRange?: string | null },
  effectiveScores: Record<string, number>,
): { mod: number; ability: "strength" | "dexterity" } {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  if (weapon.weaponRange === "ranged") return { mod: dexMod, ability: "dexterity" };
  if (weapon.finesse && dexMod > strMod) return { mod: dexMod, ability: "dexterity" };
  return { mod: strMod, ability: "strength" };
}

// deriveWeaponAttackBonus delegates here so the sum can never drift from the components — one rule, two views (#1235).
// Returns the shared-types RollEventAttackComponents wire shape (not a backend-local twin) since the JSON boundary wouldn't type-check a duplicate declaration.
export function deriveWeaponAttackComponents(
  weapon: {
    name: string;
    finesse: boolean;
    weaponClass?: string | null;
    weaponRange?: string | null;
  },
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  weaponGrants: ReadonlyArray<{ name: string }>,
  rangedAttackRollBonus = 0,
  attackRollBonus = 0,
): RollEventAttackComponents {
  const { mod: abilityMod, ability } = weaponAbilityMod(weapon, effectiveScores);
  const proficient = isProficientWithWeapon(weapon, weaponGrants);
  const rangedBonus = weapon.weaponRange === "ranged" ? rangedAttackRollBonus : 0;
  return {
    abilityMod,
    proficiencyBonus: proficient ? proficiencyBonus : 0,
    rangedBonus,
    attackRollBonus,
    ability,
  };
}

export function deriveWeaponAttackBonus(
  weapon: {
    name: string;
    finesse: boolean;
    weaponClass?: string | null;
    weaponRange?: string | null;
  },
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  weaponGrants: ReadonlyArray<{ name: string }>,
  // Archery Fighting Style feat's +2 (#1137), summed via deriveRangedAttackRollBonus.
  rangedAttackRollBonus = 0,
  // Active "attackRoll" buffs, e.g. Sacred Weapon (#419).
  attackRollBonus = 0,
): number {
  const c = deriveWeaponAttackComponents(
    weapon,
    effectiveScores,
    proficiencyBonus,
    weaponGrants,
    rangedAttackRollBonus,
    attackRollBonus,
  );
  return c.abilityMod + c.proficiencyBonus + c.rangedBonus + c.attackRollBonus;
}
