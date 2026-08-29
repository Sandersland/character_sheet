// The ignore-flag cleanup prevents StrictMode's double-invoke from stranding a stale fetch result.

import { useEffect, useMemo, useState } from "react";

import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { skillLabel } from "@/lib/abilities";
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
  proficientSkills: ChoiceOption[],
): {
  options: ChoiceOption[] | null;
  loadError: boolean;
} {
  const [options, setOptions] = useState<ChoiceOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const classNamesKey = classNames.join(",");
  // #1588: a stable key so proficientSkills' fresh identity each render doesn't refetch every kind, even though only `expertise` reads it.
  const proficientSkillsKey = proficientSkills.map((s) => s.id).join(",");

  useEffect(() => {
    if (!config) return;
    let ignore = false;
    setOptions(null);
    setLoadError(false);
    config
      .loadOptions({ targetLevel, edition, classNames, proficientSkills })
      .then((opts) => {
        if (!ignore) setOptions(opts);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classNamesKey/proficientSkillsKey are the real dependency signals; classNames/proficientSkills are fresh arrays each render
  }, [config, targetLevel, edition, classNamesKey, proficientSkillsKey]);

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

// Clears the filter text when the kind changes — a reused ChoiceStep instance would otherwise carry a stale filter onto the next kind, silently hiding its options.
export function useChoiceCatalog(
  config: ChoiceKindConfig | undefined,
  character: Character,
  targetLevel: number,
  targetClassName: string,
): ChoiceCatalog {
  // #1495: fightingStyleGrantingClasses is serializeCharacter's level-gated subset, never `character.classes` as a whole, which would wrongly include a class that hasn't reached its own grant level yet.
  const classNames = useMemo(
    () => Array.from(new Set([...(character.fightingStyleGrantingClasses ?? []), targetClassName])),
    [character.fightingStyleGrantingClasses, targetClassName],
  );
  // `?? []` guards fixtures that build a minimal Character via `as unknown as Character` and omit skills.
  const proficientSkills = useMemo(
    () => (character.skills ?? []).filter((s) => s.proficient).map((s) => ({ id: s.name, name: skillLabel(s.name) })),
    [character.skills],
  );
  const { options, loadError } = useChoiceOptions(config, targetLevel, character.rulesEdition, classNames, proficientSkills);
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
