import { useQuery } from "@tanstack/react-query";

import { fetchItems } from "@/api/client";
import { catalogKeys } from "@/api/queryKeys";
import type { Item } from "@/types/character";

// #1332: shares catalogKeys.items() with every other /items reader
// (useCharacterCreation, useCampaignItemsPanelController) so the static SRD
// catalog is fetched once per session, not once per consumer. staleTime:
// Infinity matches useReferenceData's precedent — catalog content cannot
// change mid-session. A failed fetch just leaves the list empty (matches the
// old .catch(() => setCatalog([]))).
export function useItemCatalog(): Item[] {
  const { data } = useQuery({
    queryKey: catalogKeys.items(),
    queryFn: fetchItems,
    staleTime: Infinity,
  });
  return data ?? [];
}
