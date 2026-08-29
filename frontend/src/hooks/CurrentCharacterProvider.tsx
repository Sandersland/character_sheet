/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
import { createContext, useContext, type ReactNode } from "react";

import { useCharacter } from "@/hooks/useCharacter";
import type { Character } from "@/types/character";

// Holds only the id — storing the Character itself would create a second
// source of truth and redraw the whole subtree on every write.
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
}

// No setCharacter: every mutation writes the cache itself via
// useCharacterMutation's onSuccess — a second setter here would let raw
// results re-pollute the cache. (#1284)
export function useCurrentCharacter(): CurrentCharacterValue {
  const id = useContext(CurrentCharacterIdContext);
  // Both hooks run before either guard: throwing between them would make the
  // hook count differ by path. useCharacter already no-ops on undefined.
  const { character } = useCharacter(id ?? undefined);
  if (id === null) {
    throw new Error("useCurrentCharacter must be used inside <CurrentCharacterProvider>");
  }
  if (character == null) {
    // Mount only below CharacterRouteGate: absence here is a wiring bug, not
    // a loading state — no production path clears the cache once a
    // character has loaded. (#1284)
    throw new Error(
      "useCurrentCharacter: character is absent — CurrentCharacterProvider must mount only below a loaded guard",
    );
  }
  return { character };
}
