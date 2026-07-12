// Pure hit-die helpers for level-up HP math (5e PHB fixed-average rule).

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
