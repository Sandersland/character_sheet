/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
/**
 * Workspace-scoped access to "the character this route is for" (#1284), so a
 * deeply nested component can read/write the character without a prop threaded
 * through every layer between it and the page.
 *
 * Holds only the id, never the Character itself — a second copy of the
 * Character would be a second source of truth, redrawing the whole subtree on
 * every write. Built ON TOP of useCharacter(id) so this and the page's own
 * query share one cache entry (same key -> one fetch, one cached copy),
 * instead of risking drift between two independent reads.
 *
 * Mount only below a loaded tri-state guard (see CharacterSheetPage): this
 * hook throws if the character is absent, because at that point absence is a
 * wiring bug, not a loading state (#1284 R5 — no production path clears the
 * cache once a character has loaded).
 */

import { createContext, useContext, type ReactNode } from "react";

import { useCharacter } from "@/hooks/useCharacter";
import type { Character } from "@/types/character";

const CurrentCharacterIdContext = createContext<string | null>(null);

interface Props {
  id: string;
  children: ReactNode;
}

export function CurrentCharacterProvider({ id, children }: Props) {
  return <CurrentCharacterIdContext.Provider value={id}>{children}</CurrentCharacterIdContext.Provider>;
}

export interface CurrentCharacterValue {
  character: Character;
  setCharacter: (next: Character) => void;
}

export function useCurrentCharacter(): CurrentCharacterValue {
  const id = useContext(CurrentCharacterIdContext);
  if (id === null) {
    throw new Error("useCurrentCharacter must be used inside <CurrentCharacterProvider>");
  }
  const { character, setCharacter } = useCharacter(id);
  if (character == null) {
    throw new Error(
      "useCurrentCharacter: character is absent — CurrentCharacterProvider must mount only below a loaded guard",
    );
  }
  return { character, setCharacter };
}
