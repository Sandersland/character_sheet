import { useState, type Dispatch, type SetStateAction } from "react";

import { applyInventoryTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character, InventoryOperation } from "@/types/character";

export interface InventoryTransactions {
  pending: boolean;
  error: string | null;
  addOpen: boolean;
  editingId: string | null;
  setAddOpen: Dispatch<SetStateAction<boolean>>;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  applyOps: (operations: InventoryOperation[]) => Promise<boolean>;
  submitOperations: (operations: InventoryOperation[]) => Promise<void>;
}

// Owns the async write path: POST .../inventory/transactions, swap in the returned
// character, and close the add/edit panels on success.
export function useInventoryTransactions(
  character: Character,
  onUpdate: (character: Character) => void
): InventoryTransactions {
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (operations: InventoryOperation[]) => applyInventoryTransactions(character.id, operations),
    toCharacter: (c) => c,
    fallbackMessage: "Couldn't save — try again.",
    onCharacterWritten: onUpdate,
  });

  async function applyOps(operations: InventoryOperation[]): Promise<boolean> {
    try {
      await mutation.mutateAsync(operations);
      setAddOpen(false);
      setEditingId(null);
      return true;
    } catch {
      return false;
    }
  }

  async function submitOperations(operations: InventoryOperation[]): Promise<void> {
    await applyOps(operations);
  }

  return {
    pending: mutation.isPending,
    error: mutation.error,
    addOpen,
    editingId,
    setAddOpen,
    setEditingId,
    applyOps,
    submitOperations,
  };
}
