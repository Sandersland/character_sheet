/** Standard 5e modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * The DC of the Constitution saving throw to maintain concentration after
 * taking damage (5e PHB): 10, or half the damage taken (rounded down),
 * whichever is higher. The save is made once per instance of damage.
 *
 *   e.g. 9 damage  → max(10, 4)  = 10
 *        10 damage → max(10, 5)  = 10
 *        22 damage → max(10, 11) = 11
 */
export function concentrationSaveDC(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

/** Parses a hit die string like "d8" into its face value (8). */
export function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}
