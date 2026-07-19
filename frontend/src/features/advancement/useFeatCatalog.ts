import { useCallback, useEffect, useRef, useState } from "react";

import { fetchFeats } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { featOfferedForAsiSlot } from "@/lib/featDisplay";
import type { CatalogFeat } from "@/types/character";

export interface FeatCatalog {
  catalog: CatalogFeat[] | null;
  error: string | null;
  showSpinner: boolean;
  ensureFetched: () => void;
  filter: (search: string) => CatalogFeat[];
}

// `level` is the single seam that hides Origin/Fighting Style and level-gated
// feats from the ASI picker (mirrors the server's featOfferedForAsiSlot gate).
export function useFeatCatalog(active: boolean, level: number): FeatCatalog {
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
        if (!featOfferedForAsiSlot(f, level)) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
      }),
  };
}
