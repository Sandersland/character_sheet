import { useState } from "react";
import { applyHitPointOperations } from "@/api/client";
import { rollDie } from "@/lib/dice";
import type { Character, HitPointOperation } from "@/types/character";

/**
 * Death-save controls shared by `HitPointTracker` (character sheet) and the turn
 * UI (#736). Rolling a death save (d20) and stabilizing both post through the HP
 * transaction endpoint. Extracted into a hook so both surfaces drive the same
 * ops instead of duplicating the handlers. Death-save ops deal no damage, so
 * they carry no concentration check — the minimal post here is sufficient.
 */
export function useDeathSaves(character: Character, onUpdate: (c: Character) => void) {
  const [pending, setPending] = useState(false);
  // Surface transaction failures to the caller so each consumer can render them
  // (#744) — the old shared submit() in HitPointTracker set an error; the hook
  // must keep that behaviour rather than swallow it.
  const [error, setError] = useState<string | null>(null);
  const isDying = character.hitPoints.current === 0;

  async function post(ops: HitPointOperation[]) {
    setPending(true);
    setError(null);
    try {
      const { character: updated } = await applyHitPointOperations(character.id, ops);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again");
    } finally {
      setPending(false);
    }
  }

  return {
    isDying,
    deathSaves: character.hitPoints.deathSaves,
    pending,
    error,
    onRollDeathSave: () => post([{ type: "deathSave", roll: rollDie(20) }]),
    onStabilize: () => post([{ type: "stabilize" }]),
  };
}
