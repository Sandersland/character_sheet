import type { Currency } from "@/types/character";

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

// 5e coin weight: 50 coins weigh 1 lb regardless of denomination (PHB p.143).
export function coinWeight(currency: Currency): number {
  return (currency.cp + currency.sp + currency.gp + currency.pp) / 50;
}
