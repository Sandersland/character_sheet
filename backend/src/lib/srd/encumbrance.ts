// `import type` on purpose: Currency's home module also exports Prisma-bound
// helpers, and a value import would drag the client into this pure rules file.
import type { Currency } from "@/lib/inventory/inventory-currency.js";

/**
 * Carrying capacity in pounds: Strength score × 15 (SRD 5.1 / SRD 5.2, "Carrying
 * Capacity"). Edition-invariant, so no `edition` parameter — both supported
 * editions state the same multiplier.
 *
 * Assumes a Medium or Small creature: both editions also multiply capacity by
 * size (×2 Large, and so on), which this does not model. Pass the character's
 * EFFECTIVE Strength (post-advancement clamp), never the raw column.
 */
export function carryingCapacity(strength: number): number {
  return strength * 15;
}

/**
 * Weight of a purse in pounds: 50 coins weigh 1 lb regardless of denomination
 * (SRD 5.1 / SRD 5.2, "Coins"). Edition-invariant.
 */
export function coinWeight(currency: Currency): number {
  return (currency.cp + currency.sp + currency.gp + currency.pp) / 50;
}

/** An inventory row as far as encumbrance cares: a per-unit weight and a stack size. */
export interface WeighedItem {
  weight?: number | null;
  quantity: number;
}

/**
 * Total carried weight in pounds: Σ(per-unit weight × quantity) plus the purse.
 * A weightless row (null/absent `weight`) contributes nothing rather than
 * blocking the sum — homebrew rows may legitimately omit it.
 *
 * Lives here with the other two halves so no caller has to re-derive the sum:
 * the pack total and the coins are one rule, not a serializer detail.
 */
export function carriedWeight(items: WeighedItem[], currency: Currency): number {
  const packWeight = items.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0);
  return packWeight + coinWeight(currency);
}
