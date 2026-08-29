import { createJournalEntry, deleteJournalEntry, updateJournalEntry } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

export function useJournalMutations(characterId: string) {
  const mutation = useCharacterMutation<() => Promise<Character>, Character>({
    characterId,
    mutationFn: (action) => action(),
    toCharacter: (c) => c,
    fallbackMessage: "Something went wrong.",
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
