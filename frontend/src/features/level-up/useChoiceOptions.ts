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
import type { RulesEdition } from "@character-sheet/shared-types";

const SEARCH_THRESHOLD = 8;

function useChoiceOptions(
  config: ChoiceKindConfig | undefined,
  targetLevel: number,
  edition: RulesEdition,
  classNames: string[],
): {
  options: ChoiceOption[] | null;
  loadError: boolean;
} {
  const [options, setOptions] = useState<ChoiceOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const classNamesKey = classNames.join(",");

  useEffect(() => {
    if (!config) return;
    let ignore = false;
    setOptions(null);
    setLoadError(false);
    config
      .loadOptions({ targetLevel, edition, classNames })
      .then((opts) => {
        if (!ignore) setOptions(opts);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classNamesKey is the real dependency signal; classNames is a fresh array each render (see useChoiceCatalog's useMemo, and #1495's useFeatCatalog for the same pattern)
  }, [config, targetLevel, edition, classNamesKey]);

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
  targetClassName: string,
): ChoiceCatalog {
  // #1495: the union of the character's existing classes plus the level-up
  // target's own className (which may be a brand-new multiclass entry not
  // yet on `character.classes`) — fed to fightingStyleFeat's class gate.
  // Other kinds ignore it.
  const classNames = useMemo(
    () => Array.from(new Set([...(character.classes ?? []).map((c) => c.name), targetClassName])),
    [character.classes, targetClassName],
  );
  const { options, loadError } = useChoiceOptions(config, targetLevel, character.rulesEdition, classNames);
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
