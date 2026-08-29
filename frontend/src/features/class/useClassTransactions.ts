import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

// run takes an arbitrary thunk, not a fixed op shape, since callers already normalize their own response to a Character before returning.
export function useClassTransactions(characterId: string) {
  const mutation = useCharacterMutation<() => Promise<Character>, Character>({
    characterId,
    mutationFn: (send) => send(),
    toCharacter: (c) => c,
    fallbackMessage: "Something went wrong.",
  });

  return {
    busy: mutation.isPending,
    error: mutation.error,
    // run never rejects — mutation.error carries the failure message for callers that read it after awaiting.
    run: async (send: () => Promise<Character>): Promise<void> => {
      try {
        await mutation.mutateAsync(send);
      } catch {
        // no-op
      }
    },
  };
}
