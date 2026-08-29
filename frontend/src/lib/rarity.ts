import type { BadgeTone } from "@/components/ui/Badge";
import type { ItemRarity, ItemRarityOption } from "@/types/character";

// Declares no rarity-keyed literal — labels/values arrive via `rarities`; rarityTone, the COMMON suppression, and Priceless are presentation exceptions, not rules data.

// Deliberately never degrades to the raw key — a badge renders nothing rather than flashing `VERY_RARE` on a cold cache.
export function rarityLabel(key: string, rarities: readonly ItemRarityOption[]): string | null {
  return rarities.find((r) => r.key === key)?.label ?? null;
}

// COMMON is deliberately silent here (paper-doll-scoped) — the DM's campaign surfaces call rarityLabel directly and DO badge a Common item, since there the tier is what's being authored.
export function paperDollRarityLabel(
  rarity: ItemRarity | undefined,
  rarities: readonly ItemRarityOption[],
): string | null {
  return rarity && rarity !== "COMMON" ? rarityLabel(rarity, rarities) : null;
}

// Left in the server's ascending tier order — never re-sorted client-side.
export function rarityOptions(
  rarities: readonly ItemRarityOption[],
): { key: ItemRarity; label: string }[] {
  return rarities.map(({ key, label }) => ({ key, label }));
}

// A visual-design token decision, not rules content — the backend has no BadgeTone notion and never will, so this switch stays client-side permanently.
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

export function standardValueForRarity(
  rarity: ItemRarity | null | undefined,
  rarities: readonly ItemRarityOption[],
  { isConsumable = false }: { isConsumable?: boolean } = {},
): number | null {
  const value = rarities.find((r) => r.key === rarity)?.standardValueGp ?? null;
  if (value == null) return null;
  return isConsumable ? value / 2 : value;
}

// Sanctioned exception to backend-owns-the-rules: this runs over UNSAVED DM form state with no server row to hang a resolved string on, and nothing server-side reads it.
export function rarityValueHint(
  rarity: ItemRarity | null | undefined,
  rarities: readonly ItemRarityOption[],
  { isConsumable = false }: { isConsumable?: boolean } = {},
): string | null {
  if (!rarity) return null;
  if (rarity === "ARTIFACT") return "Priceless";
  const value = standardValueForRarity(rarity, rarities, { isConsumable });
  if (value == null) return null;
  return `Standard value: ${value.toLocaleString("en-US")} gp`;
}
