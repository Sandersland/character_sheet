// Pure guard discriminator for LevelUpPage (#886). Load *errors* aren't derived
// from the character value, so the page maps its error flag separately.

import type { Character } from "@/types/character";

export type LevelUpPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not-found" }
  | { kind: "no-pending" }
  | { kind: "ready"; character: Character };

/** useCharacter's undefined = still loading, null = missing/forbidden. */
export function levelUpPageState(character: Character | null | undefined): LevelUpPageState {
  if (character === undefined) return { kind: "loading" };
  if (character === null) return { kind: "not-found" };
  if (character.pendingLevelUps === 0) return { kind: "no-pending" };
  return { kind: "ready", character };
}
