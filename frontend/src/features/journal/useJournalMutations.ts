// Shared journal CRUD state machine for the journal-page surfaces (ManuscriptPage,
// CapturePalette): one busy/error pair around the plain-REST client calls, with the
// updated Character flowing out through onUpdate. Callers keep their own UI state
// (which row is editing/confirming) and clear it on a truthy result.

import { createJournalEntry, deleteJournalEntry, updateJournalEntry } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

// Generic thunk runner — mirrors useClassTransactions' run(send) shape: the
// mutationFn just invokes whichever thunk a call site passes, so create/
// update/remove all share one scoped mutation instead of three.
export function useJournalMutations(
  characterId: string,
  onUpdate: (character: Character) => void,
) {
  const mutation = useCharacterMutation<() => Promise<Character>, Character>({
    characterId,
    mutationFn: (action) => action(),
    toCharacter: (c) => c,
    fallbackMessage: "Something went wrong.",
    onCharacterWritten: onUpdate,
  });

  async function run(action: () => Promise<Character>): Promise<boolean> {
    try {
      await mutation.mutateAsync(action);
      return true;
    } catch {
      return false;
    }
  }

  return {
    busy: mutation.isPending,
    error: mutation.error,
    create: (input: Parameters<typeof createJournalEntry>[1]) =>
      run(() => createJournalEntry(characterId, input)),
    update: (entryId: string, patch: Parameters<typeof updateJournalEntry>[2]) =>
      run(() => updateJournalEntry(characterId, entryId, patch)),
    remove: (entryId: string) => run(() => deleteJournalEntry(characterId, entryId)),
  };
}
