/**
 * Deflect Attacks (SRD 5.2, Monk L3/L13) / Deflect Missiles (SRD 5.1, Monk L3, #1505) reaction.
 * A character is served exactly one edition's action pair, never both, so `deflectBaseAction` decides every branch below.
 */

import { useEffect, useState } from "react";

import { applyActionTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { rollSpec } from "@/lib/dice";
import {
  deflectBaseAction,
  deflectRollFromAction,
  formatDeflectAttacksMessage,
  formatDeflectAttacksRedirectMessage,
  formatDeflectMissilesThrowMessage,
} from "@/lib/deflectAttacks";
import type { AvailableAction, Character } from "@/types/character";

export interface UseDeflectAttacksReactionArgs {
  character: Character;
  availableActions: AvailableAction[];
  /** turnState's reactionUsed — pending resets to false whenever this does. */
  reactionUsed: boolean;
  consumeReaction: () => void;
  setShowReactionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setReactionMessage: React.Dispatch<React.SetStateAction<string | null>>;
  attachBatchId: (batchId: string) => void;
}

export interface UseDeflectAttacksReactionReturn {
  deflectRedirectAvailable: boolean;
  redirectLabel: string;
  busy: boolean;
  error: string | null;
  handleDeflectAttacks: () => void;
  handleDeflectAttacksRedirect: () => Promise<void>;
}

export function useDeflectAttacksReaction({
  character,
  availableActions,
  reactionUsed,
  consumeReaction,
  setShowReactionMenu,
  setReactionMessage,
  attachBatchId,
}: UseDeflectAttacksReactionArgs): UseDeflectAttacksReactionReturn {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!reactionUsed) setPending(false);
  }, [reactionUsed]);

  const baseAction = deflectBaseAction(character);
  const is2014 = baseAction?.key === "deflectMissiles";
  const redirectKey = is2014 ? "deflectMissilesThrow" : "deflectAttacksRedirect";

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: () => applyActionTransactions(character.id, [{ type: "executeAction", actionKey: redirectKey }]),
    toCharacter: ({ batchId, ...c }) => {
      void batchId;
      return c;
    },
    fallbackMessage: "Redirect failed.",
  });

  // Relies on backend deriveActions' resourceKey gating for `enabled` — don't re-check the pool here.
  const redirectAction = availableActions.find((a) => a.key === redirectKey);
  const deflectRedirectAvailable = pending && (redirectAction?.enabled ?? false);
  // Redirect spends exactly one point in either edition (PHB'24 p.90 Deflect Attacks; PHB'14 p.77 Deflect Missiles).
  const redirectPool = redirectAction
    ? character.resources?.pools?.find((p) => p.key === "focus" || p.key === "ki")
    : undefined;
  const redirectLabel = redirectAction
    ? redirectPool
      ? `${redirectAction.name} · spend 1 ${redirectPool.label}`
      : redirectAction.name
    : "";

  function handleDeflectAttacks() {
    if (mutation.isPending || !baseAction) return;
    const reductionSpec = deflectRollFromAction(baseAction);
    if (!reductionSpec) {
      setShowReactionMenu(false);
      setReactionMessage("Deflect couldn't roll — reload the character sheet and try again.");
      return;
    }
    consumeReaction();
    setShowReactionMenu(false);
    const roll = rollSpec(reductionSpec);
    setReactionMessage(formatDeflectAttacksMessage(character, baseAction, roll, redirectAction?.enabled ?? false, redirectPool?.label));
    setPending(true);
  }

  async function handleDeflectAttacksRedirect() {
    if (!deflectRedirectAvailable || mutation.isPending) return;
    const redirectSpec = deflectRollFromAction(redirectAction);
    if (!redirectSpec) {
      // Reset pending too, or the redirect button stays enabled all turn with no path to recovery but End Turn.
      setPending(false);
      setReactionMessage((prev) => `${prev ?? ""} Redirect couldn't roll — reload the character sheet and try again.`.trim());
      return;
    }
    try {
      const updated = await mutation.mutateAsync(undefined);
      if (updated.batchId) attachBatchId(updated.batchId);
      const redirectRoll = rollSpec(redirectSpec);
      const redirectMessage = is2014
        ? formatDeflectMissilesThrowMessage(redirectRoll)
        : formatDeflectAttacksRedirectMessage(redirectRoll);
      setReactionMessage((prev) => `${prev ?? ""} ${redirectMessage}`.trim());
      setPending(false);
    } catch {
      // Resets pending so a failed redirect can't re-enable and double-spend; the post-use result strip shows reactionMessage, not mutation.error.
      setPending(false);
      setReactionMessage((prev) => `${prev ?? ""} Redirect failed — try again.`.trim());
    }
  }

  return {
    deflectRedirectAvailable,
    redirectLabel,
    busy: mutation.isPending,
    error: mutation.error,
    handleDeflectAttacks,
    handleDeflectAttacksRedirect,
  };
}
