import { useQuery } from "@tanstack/react-query";

import { fetchItems } from "@/api/client";
import { catalogKeys } from "@/api/queryKeys";
import type { Item } from "@/types/character";

// #1332: the one hook every /items reader calls (InventoryList,
// useCharacterCreation, useCampaignItemsPanelController) — shares
// catalogKeys.items() so the static SRD catalog is fetched once per cache
// lifetime (staleTime: Infinity, matching useReferenceData's precedent — the
// catalog cannot change mid-session), not once per consumer. gcTime is left at
// its default: once every consumer unmounts, the cache entry is still evicted
// after 5 minutes, same as useReferenceData/useEditions. A failed fetch just
// leaves the list empty (matches the old .catch(() => setCatalog([]))).
export function useItemCatalog(): Item[] {
  const { data } = useQuery({
    queryKey: catalogKeys.items(),
    queryFn: fetchItems,
    staleTime: Infinity,
  });
  return data ?? [];
}
