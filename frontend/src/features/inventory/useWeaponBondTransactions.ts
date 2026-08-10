import { bondWeaponTransaction, unbondWeaponTransaction } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character, WeaponBondOperation } from "@/types/character";

export interface WeaponBondTransactions {
  pending: boolean;
  error: string | null;
  submitOperations: (operations: WeaponBondOperation[]) => Promise<void>;
}

// This hook is single-op only by contract — WeaponBondToggle only ever
// submits a batch of exactly one bondWeapon/unbondWeapon op per click, and
// bondWeaponTransaction/unbondWeaponTransaction each take one inventoryItemId
// rather than a batch. Explicit length check (not `const [op] = operations`)
// so an empty array throws a clear error here instead of crashing later on
// `op.type` of undefined, and a >1 array is rejected loudly instead of
// silently dropping every op past the first (claude-review finding on #1887).
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

// Owns the async write path for the Eldritch Knight Weapon Bond toggle
// (#1854): POST .../abilities/weapon-bond/transactions, write the returned
// character straight into the query cache. Mirrors useInventoryTransactions'
// write path minus the add/edit panel state attune/unattune don't need
// either.
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
