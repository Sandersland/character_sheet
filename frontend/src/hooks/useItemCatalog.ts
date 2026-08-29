import { useQuery } from "@tanstack/react-query";

import { fetchItems } from "@/api/client";
import { catalogKeys } from "@/api/queryKeys";
import type { Item } from "@/types/character";

// Shared by every /items reader (InventoryList, useCharacterCreation,
// useCampaignItemsPanelController) via catalogKeys.items(), so the static
// SRD catalog is fetched once per cache lifetime (staleTime: Infinity,
// matching useReferenceData), not once per consumer. gcTime is left at its
// default — the entry is still evicted 5 minutes after every consumer
// unmounts, same as useReferenceData/useEditions. A failed fetch leaves the
// list empty.
export function useItemCatalog(): Item[] {
  const { data } = useQuery({
    queryKey: catalogKeys.items(),
    queryFn: fetchItems,
    staleTime: Infinity,
  });
  return data ?? [];
}
