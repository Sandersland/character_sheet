import { useCallback, useEffect, useRef, useState } from "react";

import { fetchFeats } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CatalogFeat } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

export interface FeatCatalog {
  catalog: CatalogFeat[] | null;
  error: string | null;
  showSpinner: boolean;
  ensureFetched: () => void;
  filter: (search: string) => CatalogFeat[];
}

// asiLevel gates ASI-slot eligibility server-side (featOfferedForAsiSlot, #1438);
// `filter` here is search-only. Pass undefined to read the whole edition catalog
// — the Fighting Style picker needs rows that rule always rejects.
// classNames gates the offered Fighting Style subset via
// fightingStyleFeatOfferedForClasses (#1495); other callers omit it.
export function useFeatCatalog(
  active: boolean,
  asiLevel: number | undefined,
  edition: RulesEdition,
  classNames?: string[],
): FeatCatalog {
  const [catalog, setCatalog] = useState<CatalogFeat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchedKey = useRef<string | null>(null);
  const showSpinner = useDelayedFlag(active && catalog === null && !error);

  const ensureFetched = useCallback(() => {
    const key = `${edition}|${asiLevel ?? ""}|${(classNames ?? []).join(",")}`;
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    // Clear before refetching — otherwise stale rows (e.g. Epic Boons from a
    // higher level) stay visible until the new response lands and get 400'd on write.
    setCatalog(null);
    setError(null);
    // Omit the third argument entirely when absent, rather than passing undefined,
    // to keep existing callers' pinned fetchFeats(edition, asiLevel) call shape (#1495).
    (classNames === undefined ? fetchFeats(edition, asiLevel) : fetchFeats(edition, asiLevel, classNames))
      // A superseded request must not win a race against a newer asiLevel's fetch.
      .then((rows) => { if (fetchedKey.current === key) setCatalog(rows); })
      .catch(() => { if (fetchedKey.current === key) setError("Couldn't load feat catalog."); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classNames is an array literal at most call sites; depending on it by reference would refetch every render. The join() inside `key` above is the real dependency signal.
  }, [edition, asiLevel, (classNames ?? []).join(",")]);

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
