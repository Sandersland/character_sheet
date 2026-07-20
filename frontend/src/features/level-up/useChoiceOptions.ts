// Catalog state for a Choose-N step (#896). useChoiceOptions owns the raw
// fetch/loading/error, keyed on the choice config identity so reusing one
// ChoiceStep instance across adjacent kinds (maneuvers → toolProficiency)
// refetches the new kind; the null-reset shows a spinner in the gap, and the
// ignore-flag cleanup keeps StrictMode's double-invoke from stranding it (a
// fetch-once ref guard did exactly that). useChoiceCatalog layers the derived,
// displayable view on top.

import { useEffect, useMemo, useState } from "react";

import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import {
  emptyChoiceText,
  filterChoiceOptions,
  type ChoiceKindConfig,
  type ChoiceOption,
} from "@/lib/levelUpChoices";
import type { Character } from "@/types/character";

const SEARCH_THRESHOLD = 8;

function useChoiceOptions(
  config: ChoiceKindConfig | undefined,
  targetLevel: number,
): {
  options: ChoiceOption[] | null;
  loadError: boolean;
} {
  const [options, setOptions] = useState<ChoiceOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!config) return;
    let ignore = false;
    setOptions(null);
    setLoadError(false);
    config
      .loadOptions({ targetLevel })
      .then((opts) => {
        if (!ignore) setOptions(opts);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      });
    return () => {
      ignore = true;
    };
  }, [config, targetLevel]);

  return { options, loadError };
}

export interface ChoiceCatalog {
  filtered: ChoiceOption[];
  loadError: boolean;
  showSpinner: boolean;
  showSearch: boolean;
  emptyText: string | null;
  search: string;
  setSearch: (value: string) => void;
}

/** The displayable catalog: fetched options minus already-known, search-filtered,
 *  plus the loading/error/empty presentation flags. Owns the filter text and
 *  clears it when the kind changes — a reused ChoiceStep instance would otherwise
 *  carry a stale filter onto the next kind, silently hiding its options. */
export function useChoiceCatalog(
  config: ChoiceKindConfig | undefined,
  character: Character,
  targetLevel: number,
): ChoiceCatalog {
  const { options, loadError } = useChoiceOptions(config, targetLevel);
  const showSpinner = useDelayedFlag(options === null && !loadError);
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(""), [config]);

  const known = useMemo(
    () => config?.fromCharacter(character) ?? new Set<string>(),
    [config, character],
  );
  const available = useMemo(
    () => (options ?? []).filter((o) => !known.has(o.id)),
    [options, known],
  );
  const filtered = useMemo(() => filterChoiceOptions(available, search), [available, search]);

  const loaded = options !== null && !loadError;
  return {
    filtered,
    loadError,
    showSpinner,
    showSearch: loaded && available.length > SEARCH_THRESHOLD,
    emptyText: loaded ? emptyChoiceText(available.length, filtered.length) : null,
    search,
    setSearch,
  };
}
