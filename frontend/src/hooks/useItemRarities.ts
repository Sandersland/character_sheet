import { useReferenceData } from "@/hooks/useReferenceData";
import type { ItemRarityOption } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// Module-level so an unresolved cache returns the same array reference every render, since consumers put it in useMemo/useEffect deps.
const EMPTY: ItemRarityOption[] = [];

/** Empty until the query resolves (#1437); `edition` only selects a cache slot, the rows themselves are edition-invariant. */
export function useItemRarities(edition: RulesEdition | null | undefined): ItemRarityOption[] {
  const { reference } = useReferenceData(edition);
  return reference?.itemRarities ?? EMPTY;
}
