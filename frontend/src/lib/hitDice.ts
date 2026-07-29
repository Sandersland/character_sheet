// Pure hit-die helpers for level-up HP math (5e PHB fixed-average rule).

import { abilityAbbr, abilityModifier, formatModifier } from "@/lib/abilities";
import type { Character, ClassOption, HitPointsStepMeta, LevelUpStep, LevelUpTarget } from "@/types/character";

/** Parse a hit-die string ("d10") to its face count (10). */
export function dieFaces(die: string): number {
  return Number(die.replace(/^d/i, ""));
}

const INERT_HP_META: HitPointsStepMeta = {
  die: "",
  faces: 0,
  conMod: 0,
  fixedAverage: 0,
  averageGain: 0,
  minRoll: 0,
  maxRoll: 0,
};

/**
 * Safe reads of the served hitPoints-step meta (#1380). Defaults are inert
 * rather than plausible: a malformed payload must render as nothing, never as a
 * different class's die that a player could mistake for the real answer.
 */
export function readHitPointsMeta(step: LevelUpStep | undefined): HitPointsStepMeta {
  const meta = step?.meta;
  if (!meta) return INERT_HP_META;
  const num = (key: keyof HitPointsStepMeta): number => (typeof meta[key] === "number" ? meta[key] : 0);
  return {
    die: typeof meta.die === "string" ? meta.die : "",
    faces: num("faces"),
    conMod: num("conMod"),
    fixedAverage: num("fixedAverage"),
    averageGain: num("averageGain"),
    minRoll: num("minRoll"),
    maxRoll: num("maxRoll"),
  };
}

/**
 * HP gained for a die the player actually rolled.
 *
 * Sanctioned client-side exception (#1380), recorded here so it stops being
 * re-flagged as a rules mirror — the same treatment #1378 gives `critDamageSpec`.
 * The rolled value is player input the server has not seen yet, so no served
 * number can cover it; this composes two SERVED numbers (`minRoll` IS the
 * max(1, …) level-up floor) rather than re-deriving the rule, and the server
 * recomputes the gain authoritatively through `levelUpHpGain` at submit.
 */
export function hpGainForRoll(meta: HitPointsStepMeta, roll: number): number {
  return Math.max(meta.minRoll, roll + meta.conMod);
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
  target: LevelUpTarget | undefined,
): HitPointStepMath {
  const conMod = abilityModifier(character.abilityScores.constitution);
  const die = advancingHitDie(character, referenceClasses, target);
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
