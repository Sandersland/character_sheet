import { applyHitPointOperations } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { rollDie } from "@/lib/dice";
import type { Character, HitPointOperation } from "@/types/character";

/**
 * Death-save controls shared by `HitPointTracker` (character sheet) and the turn
 * UI (#736). Rolling a death save (d20) and stabilizing both post through the HP
 * transaction endpoint. Extracted into a hook so both surfaces drive the same
 * ops instead of duplicating the handlers. Death-save ops deal no damage, so
 * they carry no concentration check — the minimal post here is sufficient.
 */
export function useDeathSaves(character: Character, setCharacter: (c: Character) => void) {
  const isDying = character.hitPoints.current === 0;

  // Surface transaction failures to the caller so each consumer can render them
  // (#744) — the old shared submit() in HitPointTracker set an error; the hook
  // must keep that behaviour rather than swallow it.
  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: HitPointOperation[]) => applyHitPointOperations(character.id, ops),
    toCharacter: (r) => r.character,
    fallbackMessage: "Something went wrong — try again",
    onCharacterWritten: (r) => setCharacter(r.character),
  });

  async function post(ops: HitPointOperation[]) {
    try {
      await mutation.mutateAsync(ops);
    } catch {
      // mutation.error already carries the message; nothing further to do here.
    }
  }

  return {
    isDying,
    deathSaves: character.hitPoints.deathSaves,
    pending: mutation.isPending,
    error: mutation.error,
    onRollDeathSave: () => post([{ type: "deathSave", roll: rollDie(20) }]),
    onStabilize: () => post([{ type: "stabilize" }]),
  };
}
