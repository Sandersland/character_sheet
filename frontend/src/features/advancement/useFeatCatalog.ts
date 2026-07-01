import { useCallback, useEffect, useRef, useState } from "react";

import { fetchFeats } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CatalogFeat } from "@/types/character";

export interface FeatCatalog {
  catalog: CatalogFeat[] | null;
  error: string | null;
  showSpinner: boolean;
  ensureFetched: () => void;
  filter: (search: string) => CatalogFeat[];
}

export function useFeatCatalog(active: boolean): FeatCatalog {
  const [catalog, setCatalog] = useState<CatalogFeat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const showSpinner = useDelayedFlag(active && catalog === null && !error);

  const ensureFetched = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchFeats()
      .then(setCatalog)
      .catch(() => setError("Couldn't load feat catalog."));
  }, []);

  useEffect(() => {
    if (active) ensureFetched();
  }, [active, ensureFetched]);

  return {
    catalog,
    error,
    showSpinner,
    ensureFetched,
    filter: (search) =>
      (catalog ?? []).filter((f) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
      }),
  };
}
