// Pure hit-die helpers for level-up HP math (5e PHB fixed-average rule).

import { abilityAbbr, abilityModifier, formatModifier } from "@/lib/abilities";
import type { Character, ClassOption, LevelUpTarget } from "@/types/character";

/** Parse a hit-die string ("d10") to its face count (10). */
export function dieFaces(die: string): number {
  return Number(die.replace(/^d/i, ""));
}

/** Hit die of the class a level-up advances (differs from the primary die once multiclassing). */
export function advancingHitDie(
  character: Character,
  referenceClasses: ClassOption[],
  target: LevelUpTarget | undefined,
): string {
  const advancingName =
    target?.kind === "new"
      ? referenceClasses.find((c) => c.id === target.classId)?.name
      : character.classes?.find((e) => e.id === target?.classEntryId)?.name;
  return referenceClasses.find((c) => c.name === advancingName)?.hitDie ?? character.hitDice.die;
}

/** Fixed average HP gain: floor(faces/2) + 1 + Con mod, clamped at 1. */
export function averageHitPointGain(faces: number, conMod: number): number {
  return Math.max(1, Math.floor(faces / 2) + 1 + conMod);
}

/** Inclusive roll range for a level-up hit die, each end clamped at 1. */
export function hitPointGainRange(faces: number, conMod: number): { min: number; max: number } {
  return { min: Math.max(1, 1 + conMod), max: Math.max(1, faces + conMod) };
}

/** Everything the HP level-up step derives for one advancing class: the die, its
 *  faces, the Con modifier (value + display), and the average/roll HP gains. */
export interface HitPointStepMath {
  die: string;
  faces: number;
  conMod: number;
  conLabel: string;
  conText: string;
  averageGain: number;
  fixedBase: number;
  minRoll: number;
  maxRoll: number;
}

export function hitPointStepMath(
  character: Character,
  referenceClasses: ClassOption[],
  classEntryId: string | undefined,
): HitPointStepMath {
  const conMod = abilityModifier(character.abilityScores.constitution);
  const die = advancingHitDie(
    character,
    referenceClasses,
    classEntryId ? { kind: "existing", classEntryId } : undefined,
  );
  const faces = dieFaces(die);
  const { min, max } = hitPointGainRange(faces, conMod);
  return {
    die,
    faces,
    conMod,
    conLabel: formatModifier(conMod),
    conText: `${formatModifier(conMod)} ${abilityAbbr("constitution")}`,
    averageGain: averageHitPointGain(faces, conMod),
    fixedBase: averageHitPointGain(faces, 0),
    minRoll: min,
    maxRoll: max,
  };
}
