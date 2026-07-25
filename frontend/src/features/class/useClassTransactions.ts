import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

// Shared busy/error runner for ClassFeaturesSection's transaction endpoints.
// `run` takes an arbitrary thunk (not a fixed op shape) because its callers
// span several distinct endpoints (setSubclass, resource ops, shadow arts,
// warrior-of-elements, fighting-style feats) that already normalize their own
// response to a bare Character before returning — mutationFn just invokes
// whichever thunk a call site passes, so every existing call site (`run(() =>
// applyX(...))`) keeps working unchanged.
export function useClassTransactions(characterId: string, onUpdate: (updated: Character) => void) {
  const mutation = useCharacterMutation<() => Promise<Character>, Character>({
    characterId,
    mutationFn: (send) => send(),
    toCharacter: (c) => c,
    fallbackMessage: "Something went wrong.",
    onCharacterWritten: onUpdate,
  });

  return {
    busy: mutation.isPending,
    error: mutation.error,
    // Resolves once the attempt settles either way (never rejects) — mirrors
    // the pre-#1283 try/catch-and-swallow contract; mutation.error already
    // carries the failure message for callers that read it after awaiting.
    run: async (send: () => Promise<Character>): Promise<void> => {
      try {
        await mutation.mutateAsync(send);
      } catch {
        // no-op
      }
    },
  };
}
