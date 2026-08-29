import { applyHitPointOperations } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { rollDie } from "@/lib/dice";
import type { Character, HitPointOperation } from "@/types/character";

export function useDeathSaves(character: Character) {
  const isDying = character.hitPoints.current === 0;

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: HitPointOperation[]) => applyHitPointOperations(character.id, ops),
    toCharacter: (r) => r.character,
    fallbackMessage: "Something went wrong — try again",
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
