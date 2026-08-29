import type { HitPointsStepMeta, LevelUpStep } from "@/types/character";

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
  effectiveMaxAverage: 0,
  effectiveMaxByRoll: [],
};

// #1380: defaults are inert rather than plausible — a malformed payload must render as nothing, never as a different class's die a player could mistake for the real answer.
export function readHitPointsMeta(step: LevelUpStep | undefined): HitPointsStepMeta {
  const meta = step?.meta;
  if (!meta) return INERT_HP_META;
  // `die`/`effectiveMaxByRoll` are excluded here deliberately: num(either) would quietly read 0 instead of failing to compile.
  const num = (key: Exclude<keyof HitPointsStepMeta, "die" | "effectiveMaxByRoll">): number =>
    typeof meta[key] === "number" ? meta[key] : 0;
  const effectiveMaxByRoll =
    Array.isArray(meta.effectiveMaxByRoll) && meta.effectiveMaxByRoll.every((v) => typeof v === "number")
      ? (meta.effectiveMaxByRoll as number[])
      : [];
  return {
    die: typeof meta.die === "string" ? meta.die : "",
    faces: num("faces"),
    conMod: num("conMod"),
    fixedAverage: num("fixedAverage"),
    averageGain: num("averageGain"),
    minRoll: num("minRoll"),
    maxRoll: num("maxRoll"),
    effectiveMaxAverage: num("effectiveMaxAverage"),
    effectiveMaxByRoll,
  };
}

// Composes only SERVED numbers (`minRoll` IS the max(1, …) level-up floor); the server recomputes the gain authoritatively via `levelUpHpGain` at submit.
export function hpGainForRoll(meta: HitPointsStepMeta, roll: number): number {
  return Math.max(meta.minRoll, roll + meta.conMod);
}

// #1497: reads `effectiveMaxByRoll[roll]` directly rather than `currentMax + hpGainForRoll(...)`, which is wrong once 2014 exhaustion 4+ (PHB'14 p. 291) halves the max — the halving depends on the pre-halving max's parity, unrecoverable from the already-halved served max.
export function effectiveMaxForRoll(meta: HitPointsStepMeta, roll: number): number {
  return meta.effectiveMaxByRoll[roll] ?? 0;
}
