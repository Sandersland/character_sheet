import { useReferenceData } from "@/hooks/useReferenceData";
import type { ItemRarityOption } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// Module-level, so an unresolved cache returns the SAME array every render:
// consumers put these rows in useMemo/useEffect dependency arrays, and a fresh
// [] per render would re-run them forever.
const EMPTY: ItemRarityOption[] = [];

/**
 * The six magic-item rarity tiers served by GET /api/reference (#1437). Empty
 * until the query resolves — every consumer renders nothing rather than falling
 * back to a raw enum key. `edition` only selects a cache slot here: the rows
 * themselves are edition-invariant.
 */
export function useItemRarities(edition: RulesEdition | null | undefined): ItemRarityOption[] {
  const { reference } = useReferenceData(edition);
  return reference?.itemRarities ?? EMPTY;
}
