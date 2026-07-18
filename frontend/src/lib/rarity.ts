import type { BadgeTone } from "@/components/ui/Badge";
import type { ItemRarity } from "@/types/character";

/**
 * Display labels + standard gp values for the six 5e magic-item rarity tiers.
 * Mirrors the backend rules data ITEM_RARITIES — the backend
 * stays the single source of truth; this is presentation metadata only (labels +
 * the derived value hint). Never render a raw rarity key; resolve via rarityLabel().
 */

export const ITEM_RARITY_LABELS: Record<ItemRarity, string> = {
  COMMON: "Common",
  UNCOMMON: "Uncommon",
  RARE: "Rare",
  VERY_RARE: "Very Rare",
  LEGENDARY: "Legendary",
  ARTIFACT: "Artifact",
};

/** Ascending tier order for pickers/badges. */
const RARITY_ORDER: readonly ItemRarity[] = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "VERY_RARE",
  "LEGENDARY",
  "ARTIFACT",
];

/** Standard buy value in gp per tier; null for priceless (Artifact). */
const RARITY_STANDARD_VALUE_GP: Record<ItemRarity, number | null> = {
  COMMON: 100,
  UNCOMMON: 400,
  RARE: 4000,
  VERY_RARE: 40000,
  LEGENDARY: 200000,
  ARTIFACT: null,
};

export const RARITY_OPTIONS: readonly { key: ItemRarity; label: string }[] = RARITY_ORDER.map(
  (key) => ({ key, label: ITEM_RARITY_LABELS[key] }),
);

/** Display label for a rarity key. Tolerant: unknown keys degrade to self. */
export function rarityLabel(key: string): string {
  return ITEM_RARITY_LABELS[key as ItemRarity] ?? key;
}

/** Soft badge tone per tier for optional visual tiering. */
export function rarityTone(key: ItemRarity): BadgeTone {
  switch (key) {
    case "UNCOMMON":
      return "vitality";
    case "RARE":
    case "VERY_RARE":
      return "arcane";
    case "LEGENDARY":
      return "gold";
    case "ARTIFACT":
      return "garnet";
    default:
      return "neutral";
  }
}

// Standard gp value for a rarity; a consumable is worth half (Artifact is always
// priceless). Null rarity or unknown tier → null.
export function standardValueForRarity(
  rarity: ItemRarity | null | undefined,
  { isConsumable = false }: { isConsumable?: boolean } = {},
): number | null {
  const value = rarity ? RARITY_STANDARD_VALUE_GP[rarity] : null;
  if (value == null) return null;
  return isConsumable ? value / 2 : value;
}

/** Human hint for the form's Value field, e.g. "Standard value: 2,000 gp". */
export function rarityValueHint(
  rarity: ItemRarity | null | undefined,
  { isConsumable = false }: { isConsumable?: boolean } = {},
): string | null {
  if (!rarity) return null;
  if (rarity === "ARTIFACT") return "Priceless";
  const value = standardValueForRarity(rarity, { isConsumable });
  if (value == null) return null;
  return `Standard value: ${value.toLocaleString("en-US")} gp`;
}
