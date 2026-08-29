// `import type` on purpose: Currency's home module also exports Prisma-bound helpers, and a value import would drag the client into this pure rules file.
import type { Currency } from "@/lib/inventory/inventory-currency.js";

// SRD 5.1 / SRD 5.2 "Carrying Capacity": Strength score × 15, edition-invariant, assuming Medium/Small (no size multiplier).
// Pass EFFECTIVE Strength (post-advancement clamp), never the raw column.
export function carryingCapacity(strength: number): number {
  return strength * 15;
}

// SRD 5.1 / SRD 5.2 "Coins": 50 coins weigh 1 lb regardless of denomination.
export function coinWeight(currency: Currency): number {
  return (currency.cp + currency.sp + currency.gp + currency.pp) / 50;
}

export interface WeighedItem {
  weight?: number | null;
  quantity: number;
}

// A weightless row (null/absent weight) contributes nothing rather than blocking the sum — homebrew rows may legitimately omit it.
export function carriedWeight(items: WeighedItem[], currency: Currency): number {
  const packWeight = items.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0);
  return packWeight + coinWeight(currency);
}
