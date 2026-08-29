// DMG p. 135: the six magic-item rarity tiers, standard buy value in gp (midpoint of the DMG range); Artifacts priceless.

// ITEM_RARITY_KEYS lives in @character-sheet/contracts (#1647, leaf zone) — re-exported here so ItemRarity and existing importers keep resolving; the gp values in ITEM_RARITIES stay backend-side.
import { ITEM_RARITY_KEYS } from "@character-sheet/contracts";

export { ITEM_RARITY_KEYS };

export type ItemRarity = (typeof ITEM_RARITY_KEYS)[number];

export interface RarityDefinition {
  key: ItemRarity;
  label: string;
  standardValueGp: number | null;
}

export const ITEM_RARITIES: readonly RarityDefinition[] = [
  { key: "COMMON", label: "Common", standardValueGp: 100 },
  { key: "UNCOMMON", label: "Uncommon", standardValueGp: 400 },
  { key: "RARE", label: "Rare", standardValueGp: 4000 },
  { key: "VERY_RARE", label: "Very Rare", standardValueGp: 40000 },
  { key: "LEGENDARY", label: "Legendary", standardValueGp: 200000 },
  { key: "ARTIFACT", label: "Artifact", standardValueGp: null },
];

export function isKnownRarity(key: string): key is ItemRarity {
  return ITEM_RARITIES.some((r) => r.key === key);
}

export function standardValueForRarity(
  rarity: ItemRarity | null | undefined,
  { isConsumable = false }: { isConsumable?: boolean } = {},
): number | null {
  const def = ITEM_RARITIES.find((r) => r.key === rarity);
  if (!def || def.standardValueGp === null) return null;
  return isConsumable ? def.standardValueGp / 2 : def.standardValueGp;
}
