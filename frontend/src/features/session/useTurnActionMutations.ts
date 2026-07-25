/**
 * useTurnActionMutations — the applyActionTransactions/revertBatch/
 * rollInitiativeTransaction mutations behind useTurnActions, split into its
 * own module so their hook-composition doesn't count against that hub's own
 * complexity budget (mirrors ProficienciesCard's useToolProficiencyMutations).
 *
 * Each endpoint gets its own useCharacterMutation instance (distinct fallback
 * copy per action), all sharing one `character-${id}` scope. `applyAction` and
 * `rollInitiative` both return `Character & { batchId?/results }` (#1283 shape
 * C) — `toCharacter` strips the extra key before caching, but the caller still
 * gets it back from `mutateAsync`'s raw result to fold into turn-undo/combat-log.
 */

import { applyActionTransactions, revertBatch, rollInitiativeTransaction } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { ActionOperation, Character, ResourceOpResult } from "@/types/character";

export function useTurnActionMutations(characterId: string, onUpdate: (c: Character) => void) {
  const actionMutation = useCharacterMutation({
    characterId,
    mutationFn: (ops: ActionOperation[]) => applyActionTransactions(characterId, ops),
    toCharacter: ({ batchId, ...character }) => {
      void batchId;
      return character;
    },
    fallbackMessage: "Action failed.",
    onCharacterWritten: onUpdate,
  });

  const undoMutation = useCharacterMutation({
    characterId,
    mutationFn: (batchId: string) => revertBatch(characterId, batchId),
    toCharacter: (c) => c,
    fallbackMessage: "Undo failed.",
    onCharacterWritten: onUpdate,
  });

  const actionSurgeMutation = useCharacterMutation({
    characterId,
    mutationFn: () => applyActionTransactions(characterId, [{ type: "executeAction", actionKey: "actionSurge" }]),
    toCharacter: ({ batchId, ...character }) => {
      void batchId;
      return character;
    },
    fallbackMessage: "Action Surge failed.",
    onCharacterWritten: onUpdate,
  });

  // Best-effort (no UI error surface, mirrors pre-#1283 console.error-only
  // behaviour) — a failed combat-start regen shouldn't block starting combat.
  const initiativeMutation = useCharacterMutation({
    characterId,
    mutationFn: () => rollInitiativeTransaction(characterId),
    toCharacter: ({ results, ...character }) => {
      void results;
      return character;
    },
    fallbackMessage: "Failed to roll initiative.",
    onCharacterWritten: onUpdate,
  });

  async function sendAction(actionKey: string, opts?: { roll?: number; inventoryItemId?: string }) {
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

  // Clear every mutation's stale error — called at the turn-phase boundaries
  // (start/end turn, end combat) that used to reset the old shared error state.
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
