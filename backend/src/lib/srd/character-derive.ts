import { SKILLS } from "@/lib/srd/alignments.js";
import { abilityModifier, hitDieFace } from "@/lib/srd/math.js";

export interface ToolProficiencyEntry {
  name: string;
  source: "background" | "class";
}

export interface DeriveCharacterInput {
  abilityScores: Record<string, number>;
  skillProficiencies: string[];
  toolProficiencies?: ToolProficiencyEntry[];
}

export interface DeriveCharacterCatalog {
  species: { speed: number };
  characterClass: { hitDie: string; savingThrows: string[] };
}

export interface DerivedCharacterFields {
  speed: number;
  hitDice: { total: number; die: string; spent: number };
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } };
  initiativeBonus: number;
  savingThrowProficiencies: string[];
  skills: { name: string; ability: string; proficient: boolean }[];
  // Never reconciled on level-down.
  toolProficiencies: ToolProficiencyEntry[];
  currency: { cp: number; sp: number; gp: number; pp: number };
  spellcasting: null;
}

export function deriveCreatedCharacter(
  input: DeriveCharacterInput,
  catalog: DeriveCharacterCatalog
): DerivedCharacterFields {
  const constitutionModifier = abilityModifier(input.abilityScores.constitution);
  const dexterityModifier = abilityModifier(input.abilityScores.dexterity);
  const maxHitPoints = Math.max(1, hitDieFace(catalog.characterClass.hitDie) + constitutionModifier);

  return {
    speed: catalog.species.speed,
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
