import { SKILLS } from "@/lib/srd/alignments.js";
import { abilityModifier, hitDieFace } from "@/lib/srd/math.js";

export interface ToolProficiencyEntry {
  name: string;
  /** Origin of the proficiency — used to distinguish creation-fixed entries
   *  (never trimmed on level-down) from subclass-granted ones (reconciled). */
  source: "background" | "class" | "race";
}

export interface DeriveCharacterInput {
  abilityScores: Record<string, number>;
  skillProficiencies: string[];
  /** Tool proficiencies granted by background / class / race at creation. */
  toolProficiencies?: ToolProficiencyEntry[];
}

export interface DeriveCharacterCatalog {
  race: { speed: number };
  characterClass: { hitDie: string; savingThrows: string[] };
}

export interface DerivedCharacterFields {
  speed: number;
  hitDice: { total: number; die: string; spent: number };
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } };
  initiativeBonus: number;
  savingThrowProficiencies: string[];
  skills: { name: string; ability: string; proficient: boolean }[];
  /** Creation-fixed tool proficiencies (background / class / race).
   *  Stored in Character.toolProficiencies Json column; never reconciled on level-down. */
  toolProficiencies: ToolProficiencyEntry[];
  currency: { cp: number; sp: number; gp: number; pp: number };
  spellcasting: null;
}

/**
 * Derives a newly-created level-1 character's mechanical fields from the
 * player's choices (ability scores, chosen skill proficiencies) plus the
 * resolved race/class catalog rows. Pure function — no DB access.
 */
export function deriveCreatedCharacter(
  input: DeriveCharacterInput,
  catalog: DeriveCharacterCatalog
): DerivedCharacterFields {
  const constitutionModifier = abilityModifier(input.abilityScores.constitution);
  const dexterityModifier = abilityModifier(input.abilityScores.dexterity);
  const maxHitPoints = Math.max(1, hitDieFace(catalog.characterClass.hitDie) + constitutionModifier);

  return {
    speed: catalog.race.speed,
    hitDice: { total: 1, die: catalog.characterClass.hitDie, spent: 0 },
    hitPoints: { current: maxHitPoints, max: maxHitPoints, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    initiativeBonus: dexterityModifier,
    savingThrowProficiencies: catalog.characterClass.savingThrows,
    skills: SKILLS.map(({ name, ability }) => ({
      name,
      ability,
      proficient: input.skillProficiencies.includes(name),
    })),
    toolProficiencies: input.toolProficiencies ?? [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    spellcasting: null,
  };
}
