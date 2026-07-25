/**
 * Bumps the session log's refresh counter whenever the character cache is
 * written (#1284), replacing `useCombatLifecycle`'s old `handleCharacterUpdate`
 * wrapper — which only fired for updates that happened to flow through the
 * combat lifecycle's own `onUpdate`. Mounted once in CharacterSheetWorkspace,
 * this fires for EVERY write (the sheet-header HP path included) — a strict
 * superset of the old behaviour, and the intended fix, not a bug.
 *
 * The ref is seeded with the character present at mount so the initial load
 * itself never counts as a "write"; only a later cache write (a different
 * object reference — structural sharing keeps an unchanged write's reference
 * stable) triggers the bump.
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
