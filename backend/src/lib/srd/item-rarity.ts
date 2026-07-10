// The six 5e magic-item rarity tiers (DMG p. 135) in ascending order, each with
// its standard buy value in gp (midpoint of the DMG range). Artifacts are
// priceless (null). This is the single source of truth for rarity rules data —
// the frontend resolves display labels from these keys, never rendering them raw.

export const ITEM_RARITY_KEYS = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "VERY_RARE",
  "LEGENDARY",
  "ARTIFACT",
] as const;

export type ItemRarity = (typeof ITEM_RARITY_KEYS)[number];

export interface RarityDefinition {
  key: ItemRarity;
  label: string;
  /** Standard buy value in gp; null for priceless (Artifact). */
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

/** Returns true if `key` is a known rarity enum value (exact, case-sensitive). */
export function isKnownRarity(key: string): key is ItemRarity {
  return ITEM_RARITIES.some((r) => r.key === key);
}

// Standard gp value for a rarity; a consumable is worth half (Artifact is always
// priceless). Null rarity or unknown tier → null.
export function standardValueForRarity(
  rarity: ItemRarity | null | undefined,
  { isConsumable = false }: { isConsumable?: boolean } = {},
): number | null {
  const def = ITEM_RARITIES.find((r) => r.key === rarity);
  if (!def || def.standardValueGp === null) return null;
  return isConsumable ? def.standardValueGp / 2 : def.standardValueGp;
}
