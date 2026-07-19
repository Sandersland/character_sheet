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
 * Fixed weapon/armor proficiencies granted by each class at creation (PHB).
 * Keyed by class display name, matching CharacterClassEntry.name from the seed.
 * Unknown class names are treated as granting nothing — no crash, no spurious grants.
 */
export const CLASS_PROFICIENCY_GRANTS: Record<string, ProficiencyGrant> = {
  Barbarian: { armor: ["light", "medium", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Bard:      { armor: ["light"],                     weapons: ["Simple Weapons", "Hand Crossbows", "Longswords", "Rapiers", "Shortswords"] },
  Cleric:    { armor: ["light", "medium", "shield"], weapons: ["Simple Weapons"] },
  Druid:     { armor: ["light", "medium", "shield"], weapons: ["Clubs", "Daggers", "Darts", "Javelins", "Maces", "Quarterstaffs", "Scimitars", "Sickles", "Slings", "Spears"] },
  Fighter:   { armor: ["light", "medium", "heavy", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Monk:      { armor: [],                            weapons: ["Simple Weapons", "Shortswords"] },
  Paladin:   { armor: ["light", "medium", "heavy", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Ranger:    { armor: ["light", "medium", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Rogue:     { armor: ["light"],                     weapons: ["Simple Weapons", "Hand Crossbows", "Longswords", "Rapiers", "Shortswords"] },
  Sorcerer:  { armor: [],                            weapons: ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light Crossbows"] },
  Warlock:   { armor: ["light"],                     weapons: ["Simple Weapons"] },
  Wizard:    { armor: [],                            weapons: ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light Crossbows"] },
};

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
function isProficientWithWeapon(
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
/** Shared helper — same ability-selection rule used for both attack and damage. */
export function weaponAbilityMod(
  weapon: { finesse: boolean; weaponRange?: string | null },
  effectiveScores: Record<string, number>,
): number {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  if (weapon.weaponRange === "ranged") return dexMod;
  if (weapon.finesse) return Math.max(strMod, dexMod);
  return strMod;
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
  const abilityMod = weaponAbilityMod(weapon, effectiveScores);
  const proficient = isProficientWithWeapon(weapon, weaponGrants);
  const rangedBonus = weapon.weaponRange === "ranged" ? rangedAttackRollBonus : 0;
  return abilityMod + (proficient ? proficiencyBonus : 0) + rangedBonus + attackRollBonus;
}
