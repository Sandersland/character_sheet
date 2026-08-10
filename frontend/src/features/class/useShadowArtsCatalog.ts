/**
 * useShadowArtsCatalog — fetches the edition-scoped Shadow Arts catalog for
 * ShadowArtsSection (#1738), split out of the component so its own
 * StrictMode-safe fetch-guard effect doesn't inflate ShadowArtsSection's
 * complexity score. The catalog is edition-scoped server-side (#1412), so the
 * edition belongs in the deps — Character.rulesEdition is write-once, so in
 * practice this never re-fires on its own; `retry` is the other trigger, for
 * a transient fetch failure (a page reload should not be the only recovery).
 */

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
