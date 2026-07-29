import type { BadgeTone } from "@/components/ui/Badge";
import type { ItemRarity, ItemRarityOption } from "@/types/character";

/**
 * Pure helpers over the rarity rows GET /api/reference serves (#1437). This
 * module declares no table keyed by rarity — labels and gp values are the
 * backend's and arrive as `rarities` arguments. The only rarity-key literals
 * left here are rarityTone's `case` arms, for the reason stated on it.
 */

/** Standard buy value in gp per tier; null for priceless (Artifact). */
const RARITY_STANDARD_VALUE_GP: Record<ItemRarity, number | null> = {
  COMMON: 100,
  UNCOMMON: 400,
  RARE: 4000,
  VERY_RARE: 40000,
  LEGENDARY: 200000,
  ARTIFACT: null,
};

/**
 * Display label for a rarity key, or null when the served rows haven't arrived
 * (or don't contain the key). Deliberately never degrades to the raw key: a
 * badge renders nothing rather than flashing `VERY_RARE` on a cold cache.
 */
export function rarityLabel(key: string, rarities: readonly ItemRarityOption[]): string | null {
  return rarities.find((r) => r.key === key)?.label ?? null;
}

/** rarityLabel with the paper doll's extra rule: COMMON is deliberately silent,
 *  because every mundane worn or bag item would otherwise carry a badge that
 *  says nothing. Shared by the worn rows and the slot picker so the two can't
 *  disagree about which items get a badge. */
export function paperDollRarityLabel(
  rarity: ItemRarity | undefined,
  rarities: readonly ItemRarityOption[],
): string | null {
  return rarity && rarity !== "COMMON" ? rarityLabel(rarity, rarities) : null;
}

/** The rarity picker's options, narrowed to what a `<select>` renders and left
 *  in the server's ascending tier order — never re-sorted client-side. */
export function rarityOptions(
  rarities: readonly ItemRarityOption[],
): { key: ItemRarity; label: string }[] {
  return rarities.map(({ key, label }) => ({ key, label }));
}

/** Soft badge tone per tier. A visual-design token decision, not rules content:
 *  the backend has no notion of a BadgeTone and is never going to grow one, so
 *  this switch is the source of truth for it and stays client-side permanently
 *  (#1437). */
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
