// PHB'24 class-table "Primary Ability" per class — the ability(ies) the creation
// ability panel flags as recommended (#1161). Deliberately its own record, NOT
// derived from MULTICLASS_PREREQUISITES: the two tables agree today but answer
// different questions (a class's spellcasting/attack ability vs. its multiclass
// entry gate), so coupling them would be a coincidence, not a rule.
type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

const PRIMARY_ABILITIES: Readonly<Record<string, AbilityName[]>> = {
  barbarian: ["strength"],
  bard: ["charisma"],
  cleric: ["wisdom"],
  druid: ["wisdom"],
  fighter: ["strength", "dexterity"],
  monk: ["dexterity", "wisdom"],
  paladin: ["strength", "charisma"],
  ranger: ["dexterity", "wisdom"],
  rogue: ["dexterity"],
  sorcerer: ["charisma"],
  warlock: ["charisma"],
  wizard: ["intelligence"],
};

/** The class's PHB'24 primary ability/abilities; [] for a homebrew/unknown class. */
export function primaryAbilities(className: string): AbilityName[] {
  return PRIMARY_ABILITIES[className.toLowerCase()] ?? [];
}
