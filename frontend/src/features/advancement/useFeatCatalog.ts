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

// `asiLevel` is what the server gates ASI-slot eligibility on (#1438) — the rule
// itself lives in the backend's featOfferedForAsiSlot and this hook no longer
// mirrors it, so `filter` is search-only. Pass `undefined` to read the whole
// edition catalog: the Fighting Style picker needs the fighting_style rows that
// rule always rejects.
//
// `classNames` gates the offered Fighting Style subset via
// fightingStyleFeatOfferedForClasses (#1495) — pass the character's class
// name(s) from the Fighting Style picker; other callers omit it.
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
    // Clear before refetching, or the rows from the previous asiLevel stay on
    // screen until the new response lands — and a level-DOWN (XP revoke / LIFO
    // undo) with the panel open would keep offering Epic Boons that the write
    // path then 400s. Only asiLevel makes this reachable: Character.rulesEdition
    // is write-once, so a mounted hook's edition cannot change under it.
    setCatalog(null);
    setError(null);
    // Omit the third argument entirely when absent, rather than passing
    // `undefined` — keeps the ASI feat picker's existing pinned call shape
    // (`fetchFeats(edition, asiLevel)`) unchanged for callers that never pass
    // classNames (#1495 only touches the Fighting Style picker's call site).
    (classNames === undefined ? fetchFeats(edition, asiLevel) : fetchFeats(edition, asiLevel, classNames))
      // A superseded request must not win: an asiLevel change can leave the
      // previous fetch in flight, and a late resolve would repopulate the list
      // with the old level's rows.
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
