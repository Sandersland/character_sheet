import { bondWeaponTransaction, unbondWeaponTransaction } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character, WeaponBondOperation } from "@/types/character";

export interface WeaponBondTransactions {
  pending: boolean;
  error: string | null;
  submitOperations: (operations: WeaponBondOperation[]) => Promise<void>;
}

// Single-op only: WeaponBondToggle always submits exactly one op per click, and bondWeaponTransaction/unbondWeaponTransaction each take one inventoryItemId, not a batch.
export function resolveWeaponBondMutation(characterId: string, operations: WeaponBondOperation[]): Promise<Character> {
  if (operations.length !== 1) {
    throw new Error(
      `useWeaponBondTransactions is single-op only — got ${operations.length} operations`,
    );
  }
  const [op] = operations;
  return op.type === "bondWeapon"
    ? bondWeaponTransaction(characterId, op.inventoryItemId)
    : unbondWeaponTransaction(characterId, op.inventoryItemId);
}

export function useWeaponBondTransactions(character: Character): WeaponBondTransactions {
  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (operations: WeaponBondOperation[]) => resolveWeaponBondMutation(character.id, operations),
    toCharacter: (c) => c,
    fallbackMessage: "Couldn't save — try again.",
  });

  async function submitOperations(operations: WeaponBondOperation[]): Promise<void> {
    await mutation.mutateAsync(operations);
  }

  return {
    pending: mutation.isPending,
    error: mutation.error,
    submitOperations,
  };
}
