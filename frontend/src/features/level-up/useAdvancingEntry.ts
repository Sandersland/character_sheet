// Which existing class entry the HP step advances (#887). Reads/writes the
// ?entry= query param — the ceremony re-plans off it — defaulting to the primary
// class. Multiclassing into a new class is out of scope (#892).

import { useSearchParams } from "react-router-dom";

import type { Character, ClassEntry } from "@/types/character";

export interface AdvancingEntry {
  entries: ClassEntry[];
  classEntryId: string | undefined;
  setEntry: (id: string) => void;
}

export function useAdvancingEntry(character: Character): AdvancingEntry {
  const [searchParams, setSearchParams] = useSearchParams();
  const entries = character.classes ?? [];
  return {
    entries,
    classEntryId: searchParams.get("entry") ?? entries[0]?.id,
    setEntry: (id) => setSearchParams({ entry: id }, { replace: true }),
  };
}
