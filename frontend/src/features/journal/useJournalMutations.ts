// Shared journal CRUD state machine for the two journal surfaces (JournalSection,
// CapturePalette): one busy/error pair around the plain-REST client calls, with the
// updated Character flowing out through onUpdate. Callers keep their own UI state
// (which row is editing/confirming) and clear it on a truthy result.

import { useState } from "react";

import { createJournalEntry, deleteJournalEntry, updateJournalEntry } from "@/api/client";
import type { Character } from "@/types/character";

export function useJournalMutations(
  characterId: string,
  onUpdate: (character: Character) => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Character>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    error,
    create: (input: Parameters<typeof createJournalEntry>[1]) =>
      run(() => createJournalEntry(characterId, input)),
    update: (entryId: string, body: string) =>
      run(() => updateJournalEntry(characterId, entryId, { body })),
    remove: (entryId: string) => run(() => deleteJournalEntry(characterId, entryId)),
  };
}
