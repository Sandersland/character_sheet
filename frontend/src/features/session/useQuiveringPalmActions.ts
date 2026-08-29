import { useState } from "react";

import { setQuiveringPalmTransaction, triggerQuiveringPalmTransaction } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { rollSpec } from "@/lib/dice";
import { quiveringPalmDamageRoll } from "@/lib/quiveringPalm";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

export function useQuiveringPalmActions(
  character: Character,
  turnState: TurnState & TurnStateActions,
  currentRow: AttackTallyRow | null,
  active: boolean,
) {
  const [message, setMessage] = useState<string | null>(null);

  // Two mutations (distinct fallback copy each) sharing one `character-${id}` scope so they never race each other.
  const setMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: () => setQuiveringPalmTransaction(character.id),
    toCharacter: (r) => r.character,
    fallbackMessage: "Set failed.",
  });
  const triggerMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (roll: number) => triggerQuiveringPalmTransaction(character.id, roll),
    toCharacter: (r) => r.character,
    fallbackMessage: "Trigger failed.",
  });
  const busy = setMutation.isPending || triggerMutation.isPending;
  const error = setMutation.error ?? triggerMutation.error;

  const setDisabled = busy || currentRow === null || active;
  const triggerDisabled = busy || !active;

  async function handleSet() {
    if (setDisabled) return;
    try {
      const { results } = await setMutation.mutateAsync(undefined);
      setMessage(results[0]?.summary ?? null);
    } catch {
      // setMutation.error already carries the message.
    }
  }

  async function handleTrigger() {
    if (triggerDisabled) return;
    try {
      turnState.consumeAction();
      const roll = rollSpec(quiveringPalmDamageRoll());
      const { results } = await triggerMutation.mutateAsync(roll.total);
      setMessage(results[0]?.summary ?? null);
    } catch {
      // triggerMutation.error already carries the message.
    }
  }

  return { setDisabled, triggerDisabled, message, error, handleSet, handleTrigger };
}
