/**
 * Each mutation has its own instance (distinct fallback copy) but all share one `character-${id}` scope.
 * applyAction/rollInitiative return `Character & { batchId?, results? }`; toCharacter strips those before caching, but mutateAsync's raw result still carries them for the caller to fold into turn-undo/combat-log.
 */

import { applyActionTransactions, revertBatch, rollInitiativeTransaction } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { ActionOperation, Character, ExecuteActionResult, ResourceOpResult } from "@/types/character";

export function useTurnActionMutations(characterId: string) {
  const actionMutation = useCharacterMutation({
    characterId,
    mutationFn: (ops: ActionOperation[]) => applyActionTransactions(characterId, ops),
    toCharacter: ({ batchId, results, ...character }) => {
      void batchId;
      void results;
      return character;
    },
    fallbackMessage: "Action failed.",
  });

  const undoMutation = useCharacterMutation({
    characterId,
    mutationFn: (batchId: string) => revertBatch(characterId, batchId),
    toCharacter: (c) => c,
    fallbackMessage: "Undo failed.",
  });

  const actionSurgeMutation = useCharacterMutation({
    characterId,
    mutationFn: () => applyActionTransactions(characterId, [{ type: "executeAction", actionKey: "actionSurge" }]),
    toCharacter: ({ batchId, ...character }) => {
      void batchId;
      return character;
    },
    fallbackMessage: "Action Surge failed.",
  });

  // Best-effort — a failed combat-start regen shouldn't block starting combat (no UI error surface).
  const initiativeMutation = useCharacterMutation({
    characterId,
    mutationFn: () => rollInitiativeTransaction(characterId),
    toCharacter: ({ results, ...character }) => {
      void results;
      return character;
    },
    fallbackMessage: "Failed to roll initiative.",
  });

  async function sendAction(
    actionKey: string,
    // slotLevel (#1687): the executeAction counterpart to castSpell's slotLevel picker for a `{costKind:"slot"}` ability.
    opts?: { roll?: number; inventoryItemId?: string; slotLevel?: number },
  ): Promise<Character & { batchId?: string; results?: ExecuteActionResult[] }> {
    return actionMutation.mutateAsync([{ type: "executeAction", actionKey, ...opts }]);
  }

  async function undoBatch(batchId: string): Promise<Character> {
    return undoMutation.mutateAsync(batchId);
  }

  async function spendActionSurge(): Promise<Character & { batchId?: string }> {
    return actionSurgeMutation.mutateAsync(undefined);
  }

  async function rollInitiative(): Promise<Character & { results: ResourceOpResult[] }> {
    return initiativeMutation.mutateAsync(undefined);
  }

  function resetErrors() {
    actionMutation.reset();
    undoMutation.reset();
    actionSurgeMutation.reset();
  }

  return {
    busy: actionMutation.isPending || undoMutation.isPending || actionSurgeMutation.isPending,
    error: actionMutation.error ?? undoMutation.error ?? actionSurgeMutation.error,
    resetErrors,
    sendAction,
    undoBatch,
    spendActionSurge,
    rollInitiative,
  };
}
