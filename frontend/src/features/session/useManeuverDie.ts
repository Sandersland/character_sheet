/**
 * useManeuverDie — shared Battle Master superiority-die spend hook.
 *
 * Encapsulates the "roll 1dX from the pool, POST spendResource, call onUpdate"
 * pattern so it doesn't need to be duplicated in ManeuverPrompt, InlineAttackPicker,
 * and TurnHub.
 *
 * Returns:
 *   pool       — the superiorityDice ResourcePool (undefined if character has none).
 *   diceFaces  — the numeric face count parsed from pool.die (defaults to 8).
 *   dieLabel   — e.g. "d8", "d10".
 *   busy       — true while a spend is in flight.
 *   spend(maneuverName) — rolls the die, calls applyResourceTransactions, calls
 *                         onUpdate with the updated character, and returns the die
 *                         result. Throws (or rejects) on API error.
 */

import { useState, useCallback } from "react";

import { rollSpec } from "@/lib/dice";
import { applyResourceTransactions } from "@/api/client";
import type { Character } from "@/types/character";

export interface UseManeuverDieReturn {
  pool: NonNullable<NonNullable<Character["resources"]>["pools"]>[number] | undefined;
  diceFaces: number;
  dieLabel: string;
  busy: boolean;
  spend: () => Promise<number>;
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
    async (): Promise<number> => {
      const dieResult = rollSpec({ count: 1, faces: diceFaces }).total;
      setBusy(true);
      try {
        const updated = await applyResourceTransactions(character.id, [
          { type: "spendResource", key: "superiorityDice", amount: 1, roll: dieResult },
        ]);
        onUpdate(updated);
      } finally {
        setBusy(false);
      }
      return dieResult;
    },
    [character.id, diceFaces, onUpdate],
  );

  return { pool, diceFaces, dieLabel, busy, spend };
}
