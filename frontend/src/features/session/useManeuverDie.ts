/** The server rolls the die (#418); `spend` returns that value for the caller to fold into attack/damage or reminder text. */

import { castManeuverTransaction } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

export interface UseManeuverDieReturn {
  pool: NonNullable<NonNullable<Character["resources"]>["pools"]>[number] | undefined;
  diceFaces: number;
  dieLabel: string;
  busy: boolean;
  spend: (entryId: string) => Promise<number>;
}

export function useManeuverDie(character: Character): UseManeuverDieReturn {
  const pool = character.resources?.pools?.find((p) => p.key === "superiorityDice");
  const diceFaces = pool?.die ? parseInt(pool.die.replace("d", ""), 10) : 8;
  const dieLabel = pool?.die ?? "d8";

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (entryId: string) => castManeuverTransaction(character.id, [{ type: "castManeuver", entryId }]),
    toCharacter: (r) => r.character,
    fallbackMessage: "Failed to cast maneuver",
  });

  // No try/catch here — a spend failure propagates to the caller (useManeuverActions), which is what surfaces it; this hook never exposes `error`.
  async function spend(entryId: string): Promise<number> {
    const { results } = await mutation.mutateAsync(entryId);
    return results[0]?.roll ?? 0;
  }

  return { pool, diceFaces, dieLabel, busy: mutation.isPending, spend };
}
