// Per 5e PHB: most classes get ASI slots at levels 4, 8, 12, 16, 19.
// Fighter gets two extras (levels 6 and 14); Rogue gets one extra (level 10).
// Returns the *total* number of slots the character has earned at `level`.

const BASE_ASI_LEVELS = [4, 8, 12, 16, 19];
const EXTRA_ASI_LEVELS: Record<string, number[]> = {
  fighter: [6, 14],
  rogue:   [10],
};

/**
 * Returns the cumulative number of Ability Score Improvement / Feat slots
 * the character has earned at `level`. Homebrew / unknown classes fall back
 * to the base 5-slot schedule.
 */
export function advancementSlotsForLevel(className: string, level: number): number {
  const extra = EXTRA_ASI_LEVELS[className.toLowerCase()] ?? [];
  return [...BASE_ASI_LEVELS, ...extra].filter((l) => level >= l).length;
}

// Adding a level in a NEW class via multiclassing requires a minimum ability
// score (13). Each class maps to a list of OPTIONS: the prerequisite is met when
// ANY one option is fully satisfied — abilities within an option are AND-ed,
// options are OR-ed. Fighter is the only OR class ("Str 13 or Dex 13").
export const MULTICLASS_PREREQUISITES: Readonly<Record<string, Record<string, number>[]>> = {
  barbarian: [{ strength: 13 }],
  bard: [{ charisma: 13 }],
  cleric: [{ wisdom: 13 }],
  druid: [{ wisdom: 13 }],
  fighter: [{ strength: 13 }, { dexterity: 13 }],
  monk: [{ dexterity: 13, wisdom: 13 }],
  paladin: [{ strength: 13, charisma: 13 }],
  ranger: [{ dexterity: 13, wisdom: 13 }],
  rogue: [{ dexterity: 13 }],
  sorcerer: [{ charisma: 13 }],
  warlock: [{ charisma: 13 }],
  wizard: [{ intelligence: 13 }],
};

export interface MulticlassPrerequisiteResult {
  met: boolean;
  // Human-readable requirement, e.g. "Strength 13 or Dexterity 13". Empty for a
  // homebrew/unknown class, which carries no prerequisite (always met).
  description: string;
}

// Abilities are always single lowercase words here, so a literal capitalize is
// safe (this is a backend error-message string, not UI key rendering).
function capitalizeAbility(ability: string): string {
  return ability.charAt(0).toUpperCase() + ability.slice(1);
}

/**
 * Whether `abilityScores` satisfy the 5e multiclass ability prerequisite for
 * `className`. Unknown/homebrew classes carry no prerequisite and are always met.
 */
export function multiclassPrerequisitesMet(
  className: string,
  abilityScores: Record<string, number>,
): MulticlassPrerequisiteResult {
  const options = MULTICLASS_PREREQUISITES[className.toLowerCase()];
  if (!options) return { met: true, description: "" };
  const met = options.some((option) =>
    Object.entries(option).every(([ability, min]) => (abilityScores[ability] ?? 0) >= min),
  );
  const description = options
    .map((option) =>
      Object.entries(option)
        .map(([ability, min]) => `${capitalizeAbility(ability)} ${min}`)
        .join(" and "),
    )
    .join(" or ");
  return { met, description };
}
