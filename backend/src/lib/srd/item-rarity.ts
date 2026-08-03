// The six 5e magic-item rarity tiers (DMG p. 135) in ascending order, each with
// its standard buy value in gp (midpoint of the DMG range). Artifacts are
// priceless (null). This is the single source of truth for the rarity gp VALUES;
// the key domain itself moved to contracts (#1647). The frontend resolves
// display labels from those keys, never rendering them raw.

// The key domain moved to @character-sheet/contracts (#1647): inventorySnapshotSchema
// validates against it and that package is a leaf zone, so the tuple can't live
// here. Re-exported so ItemRarity below and every existing importer (via srd.js)
// keep resolving unchanged; the gp values in ITEM_RARITIES stay backend-side.
import { ITEM_RARITY_KEYS } from "@character-sheet/contracts";

export { ITEM_RARITY_KEYS };

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
