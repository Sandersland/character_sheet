import { useState, type Dispatch, type SetStateAction } from "react";

import { applyInventoryTransactions } from "@/api/client";
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function applyOps(operations: InventoryOperation[]): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, operations);
      onUpdate(updated);
      setAddOpen(false);
      setEditingId(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function submitOperations(operations: InventoryOperation[]): Promise<void> {
    await applyOps(operations);
  }

  return { pending, error, addOpen, editingId, setAddOpen, setEditingId, applyOps, submitOperations };
}
