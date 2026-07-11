import { useState } from "react";
import { applyHitPointOperations } from "@/api/client";
import { rollDie } from "@/lib/dice";
import type { Character, HitPointOperation } from "@/types/character";

/**
 * Death-save controls shared by `HitPointTracker` (Rest & HP tab) and the turn
 * UI (#736). Rolling a death save (d20) and stabilizing both post through the HP
 * transaction endpoint. Extracted into a hook so both surfaces drive the same
 * ops instead of duplicating the handlers. Death-save ops deal no damage, so
 * they carry no concentration check — the minimal post here is sufficient.
 */
export function useDeathSaves(character: Character, onUpdate: (c: Character) => void) {
  const [pending, setPending] = useState(false);
  const isDying = character.hitPoints.current === 0;

  async function post(ops: HitPointOperation[]) {
    setPending(true);
    try {
      const { character: updated } = await applyHitPointOperations(character.id, ops);
      onUpdate(updated);
    } catch (e) {
      console.error("death save transaction failed", e);
    } finally {
      setPending(false);
    }
  }

  return {
    isDying,
    deathSaves: character.hitPoints.deathSaves,
    pending,
    onRollDeathSave: () => post([{ type: "deathSave", roll: rollDie(20) }]),
    onStabilize: () => post([{ type: "stabilize" }]),
  };
}
