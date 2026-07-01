// Pure hit-die helpers for level-up HP math (5e PHB fixed-average rule).

/** Parse a hit-die string ("d10") to its face count (10). */
export function dieFaces(die: string): number {
  return Number(die.replace(/^d/i, ""));
}

/** Fixed average HP gain: floor(faces/2) + 1 + Con mod, clamped at 1. */
export function averageHitPointGain(faces: number, conMod: number): number {
  return Math.max(1, Math.floor(faces / 2) + 1 + conMod);
}

/** Inclusive roll range for a level-up hit die, each end clamped at 1. */
export function hitPointGainRange(faces: number, conMod: number): { min: number; max: number } {
  return { min: Math.max(1, 1 + conMod), max: Math.max(1, faces + conMod) };
}
