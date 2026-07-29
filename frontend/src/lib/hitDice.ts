// Hit-die helpers for the level-up ceremony. The 5e fixed-average rule and the
// per-level floor used to live here; since #1380 the backend planner resolves
// them onto the hitPoints step's meta and this file only reads that meta,
// parses a die string, and composes the one value the server cannot know in
// advance (the player's own roll).

import type { HitPointsStepMeta, LevelUpStep } from "@/types/character";

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
