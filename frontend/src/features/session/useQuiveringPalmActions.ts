// Quivering Palm's Set/Trigger state + the two server round-trips (#1245),
// split into its own module (not a same-file local function) — a fallow
// cognitive-complexity finding attributes a same-file helper's branches to its
// sole caller regardless of extraction, so the fix is a separate file, mirroring
// useDeflectAttacksReaction.ts's own-file shape.

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
  onUpdate: (c: Character) => void,
) {
  const [message, setMessage] = useState<string | null>(null);

  // Two mutations (not one) — set/trigger keep distinct fallback copy; both
  // share one `character-${id}` scope so they (and every other character
  // mutation) can never race each other.
  const setMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: () => setQuiveringPalmTransaction(character.id),
    toCharacter: (r) => r.character,
    fallbackMessage: "Set failed.",
    onCharacterWritten: (r) => onUpdate(r.character),
  });
  const triggerMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (roll: number) => triggerQuiveringPalmTransaction(character.id, roll),
    toCharacter: (r) => r.character,
    fallbackMessage: "Trigger failed.",
    onCharacterWritten: (r) => onUpdate(r.character),
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
