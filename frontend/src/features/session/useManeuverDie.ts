/**
 * useManeuverDie — shared Battle Master superiority-die spend hook.
 *
 * Encapsulates the "cast a known maneuver, let the server roll the die, call
 * onUpdate" pattern so it isn't duplicated in ManeuverPrompt, InlineAttackPicker,
 * and TurnHub. The server owns the roll (#418): spend posts the castManeuver op
 * and returns the die value it rolled, which the caller folds into the relevant
 * attack/damage total (or shows in reminder text).
 *
 * Returns:
 *   pool       — the superiorityDice ResourcePool (undefined if character has none).
 *   diceFaces  — the numeric face count parsed from pool.die (defaults to 8).
 *   dieLabel   — e.g. "d8", "d10".
 *   busy       — true while a spend is in flight.
 *   spend(entryId) — casts the maneuver by its known-entry id, calls onUpdate with
 *                    the updated character, and returns the server-rolled die
 *                    result. Throws (or rejects) on API error.
 */

import { useState, useCallback } from "react";

import { castManeuverTransaction } from "@/api/client";
import type { Character } from "@/types/character";

export interface UseManeuverDieReturn {
  pool: NonNullable<NonNullable<Character["resources"]>["pools"]>[number] | undefined;
  diceFaces: number;
  dieLabel: string;
  busy: boolean;
  spend: (entryId: string) => Promise<number>;
}

export function useManeuverDie(
  character: Character,
  onUpdate: (c: Character) => void,
): UseManeuverDieReturn {
  const [busy, setBusy] = useState(false);

  const pool = character.resources?.pools?.find((p) => p.key === "superiorityDice");
  const diceFaces = pool?.die ? parseInt(pool.die.replace("d", ""), 10) : 8;
  const dieLabel = pool?.die ?? "d8";

  const spend = useCallback(
    async (entryId: string): Promise<number> => {
      setBusy(true);
      try {
        const { character: updated, results } = await castManeuverTransaction(character.id, [
          { type: "castManeuver", entryId },
        ]);
        onUpdate(updated);
        return results[0]?.roll ?? 0;
      } finally {
        setBusy(false);
      }
    },
    [character.id, onUpdate],
  );

  return { pool, diceFaces, dieLabel, busy, spend };
}
