import type { RollEventAttackComponents } from "@character-sheet/shared-types";

import type { ArmorCategory, ItemCategory } from "@/lib/inventory/item-detail-inputs.js";
import { abilityModifier } from "@/lib/srd/math.js";

/** Armor categories that a character can be proficient with. */
export type ArmorProficiencyCategory = "light" | "medium" | "heavy" | "shield";

/** Static armor/weapon proficiency grants from a class or race. */
export interface ProficiencyGrant {
  armor: ArmorProficiencyCategory[];
  /** May contain category labels ("Simple Weapons", "Martial Weapons") and/or
   *  specific weapon names ("Longswords"). Mixed — display renders them verbatim. */
  weapons: string[];
}

/**
 * Fixed weapon/armor proficiencies granted by race (PHB).
 * Keyed by race display name, matching raceSelection.name from the seed.
 * Races not listed (Human, Halfling, Gnome, Tiefling, etc.) grant nothing — omitted.
 */
export const RACE_PROFICIENCY_GRANTS: Record<string, ProficiencyGrant> = {
  // Dwarven weapon training; Mountain Dwarf additionally gets light + medium armor.
  "Hill Dwarf":     { armor: [],                  weapons: ["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"] },
  "Mountain Dwarf": { armor: ["light", "medium"], weapons: ["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"] },
  // Elf weapon training varies by subrace.
  "High Elf": { armor: [], weapons: ["Longswords", "Shortswords", "Shortbows", "Longbows"] },
  "Wood Elf": { armor: [], weapons: ["Longswords", "Shortswords", "Shortbows", "Longbows"] },
  Drow:       { armor: [], weapons: ["Rapiers", "Shortswords", "Hand Crossbows"] },
  // Legacy generic key: back-compat for any character created before the race list
  // was expanded to named subraces (Hill/Mountain/High/Wood/Drow).
  Dwarf:      { armor: [], weapons: ["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"] },
};

/**
 * Returns true if the character is proficient with the given weapon based on
 * their merged weapon proficiency grants.
 *
 * Grant entries mix two forms:
 *   - Category labels: "Simple Weapons" / "Martial Weapons" — matched by
 *     `weapon.weaponClass` enum value ("simple" / "martial").
 *   - Pluralised specific weapon names: "Longswords", "Hand Crossbows" —
 *     matched by stripping the trailing "s" and comparing case-insensitively
 *     to the weapon's display name (catalog names are singular).
 *
 * Tolerates `null`/`undefined` weaponClass (no category match; falls back to
 * name matching only).
 */
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

/**
 * Returns true if the character is proficient with the given armor category.
 *
 * Armor grants are category-keyed only — there is no plural specific-name form
 * to fall back on the way `isProficientWithWeapon` has one, so a category match
 * is the whole rule.
 */
export function isProficientWithArmor(
  armorCategory: ArmorCategory | null | undefined,
  grants: ReadonlyArray<{ category: string }>,
): boolean {
  if (!armorCategory) return true;
  return grants.some((grant) => grant.category === armorCategory);
}

/**
 * Proficiency for any inventory item, dispatching to the weapon or armor rule
 * by category (#554).
 *
 * An item with no derivable requirement — gear, a consumable, a weapon with no
 * `weaponClass`, armor with no `armorCategory` — is reported proficient. That is
 * a **no-warn display policy, not a rules claim**: the sheet must not flag an
 * item it cannot classify.
 *
 * Edition-invariant, so no `edition` parameter: both PHB'14 p.144–145 and
 * SRD 5.2 (Equipment) resolve proficiency by matching the item's category or
 * name against granted proficiencies.
 */
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
    // The no-warn default lives here rather than in `isProficientWithWeapon`,
    // which must keep returning false for an unclassifiable weapon so
    // `deriveWeaponAttackComponents` withholds the proficiency bonus.
    if (!item.weaponClass) return true;
    return isProficientWithWeapon(item, weaponGrants);
  }
  if (item.category === "armor") return isProficientWithArmor(item.armorCategory, armorGrants);
  return true;
}

/**
 * Derives the melee/ranged attack bonus for a single weapon. Mirrors the
 * derive-don't-persist pattern of `deriveSpellcasting`: computed at read time
 * from character ability scores, proficiency bonus, and the weapon's metadata.
 *
 * Ability selection per 5e PHB rules:
 *   - Ranged weapons (`weaponRange === "ranged"`) → DEX modifier.
 *   - Finesse weapons → higher of STR or DEX modifier.
 *   - All other melee weapons → STR modifier.
 *
 * Proficiency bonus is added only if the character is proficient with the
 * weapon (category-level or name-level match from `isProficientWithWeapon`).
 */
/**
 * Shared helper — same ability-selection rule used for both attack and
 * damage. Returns WHICH ability was chosen alongside the modifier (#1361, so
 * the combat-log drill-in can name it) — the decision lives here and only
 * here; callers destructure rather than re-deriving it.
 */
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

/**
 * Same inputs/rule as `deriveWeaponAttackBonus`, decomposed into its four
 * addends instead of summed. `deriveWeaponAttackBonus` delegates here so the
 * sum can never drift from the components — one rule, two views (#1235).
 *
 * Returns the shared-types wire shape rather than a backend-local twin: the
 * serialized value crosses to the client as `attackBonusComponents`, and a
 * second structurally-identical declaration would let a field added there go
 * silently unreturned here (the boundary is JSON, so nothing type-checks it).
 */
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
  /**
   * Flat bonus to ranged weapon attack rolls only — the Archery Fighting Style
   * feat's +2 (#1137), summed from feat improvements via deriveRangedAttackRollBonus.
   */
  rangedAttackRollBonus = 0,
  /** Flat bonus from active "attackRoll" buffs (e.g. Sacred Weapon); #419. */
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
