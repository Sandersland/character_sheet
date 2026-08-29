// The catalog is edition-scoped server-side (#1412), so rulesEdition belongs in the effect deps.
import { useCallback, useEffect, useState } from "react";

import type { RulesEdition } from "@character-sheet/shared-types";

import { fetchShadowArts } from "@/api/client";
import type { CatalogShadowArt } from "@/types/character";

export interface ShadowArtsCatalogState {
  catalog: CatalogShadowArt[] | null;
  error: string | null;
  retry: () => void;
}

export function useShadowArtsCatalog(rulesEdition: RulesEdition): ShadowArtsCatalogState {
  const [catalog, setCatalog] = useState<CatalogShadowArt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setError(null);
    fetchShadowArts(rulesEdition)
      .then((rows) => { if (mounted) setCatalog(rows); })
      .catch(() => { if (mounted) setError("Couldn't load Shadow Arts."); });
    return () => { mounted = false; };
  }, [rulesEdition, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { catalog, error, retry };
}
