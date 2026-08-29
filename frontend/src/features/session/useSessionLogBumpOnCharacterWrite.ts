/**
 * Bumps on every character-cache write, not just ones from a specific mutation path (deliberate superset, #1284).
 * Ref seeded at mount so initial load isn't a write; a later write is detected by object-reference change (structural sharing keeps a no-op write's reference stable).
 */

import { useEffect, useRef } from "react";

import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

export function useSessionLogBumpOnCharacterWrite(bumpLog: () => void): void {
  const { character } = useCurrentCharacter();
  const seenRef = useRef(character);

  useEffect(() => {
    if (seenRef.current !== character) {
      seenRef.current = character;
      bumpLog();
    }
  }, [character, bumpLog]);
}
