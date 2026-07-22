// Quivering Palm's Set/Trigger state + the two server round-trips (#1245),
// split into its own module (not a same-file local function) — a fallow
// cognitive-complexity finding attributes a same-file helper's branches to its
// sole caller regardless of extraction, so the fix is a separate file, mirroring
// useDeflectAttacksReaction.ts's own-file shape.

import { useState } from "react";

import { setQuiveringPalmTransaction, triggerQuiveringPalmTransaction } from "@/api/client";
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setDisabled = busy || currentRow === null || active;
  const triggerDisabled = busy || !active;

  async function handleSet() {
    if (setDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const { character: updated, results } = await setQuiveringPalmTransaction(character.id);
      onUpdate(updated);
      setMessage(results[0]?.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Set failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTrigger() {
    if (triggerDisabled) return;
    setBusy(true);
    setError(null);
    try {
      turnState.consumeAction();
      const roll = rollSpec(quiveringPalmDamageRoll());
      const { character: updated, results } = await triggerQuiveringPalmTransaction(character.id, roll.total);
      onUpdate(updated);
      setMessage(results[0]?.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trigger failed.");
    } finally {
      setBusy(false);
    }
  }

  return { setDisabled, triggerDisabled, message, error, handleSet, handleTrigger };
}
