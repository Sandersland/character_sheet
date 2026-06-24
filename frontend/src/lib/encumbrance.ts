/**
 * 5e carrying capacity: a creature can carry weight (in pounds) up to its
 * Strength score × 15. (Push/drag/lift and the variant encumbrance tiers from
 * the DMG are optional rules and out of scope.)
 *
 * Capacity is derive-on-read — recompute from the live STR score, never persist.
 */
export function carryingCapacity(strength: number): number {
  return strength * 15;
}
