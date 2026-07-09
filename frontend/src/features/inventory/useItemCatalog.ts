import { useEffect, useState } from "react";

import { fetchItems } from "@/api/client";
import type { Item } from "@/types/character";

// Loads the item catalog once on mount; an empty list on failure keeps the sheet usable.
export function useItemCatalog(): Item[] {
  const [catalog, setCatalog] = useState<Item[]>([]);
  useEffect(() => {
    fetchItems()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);
  return catalog;
}
