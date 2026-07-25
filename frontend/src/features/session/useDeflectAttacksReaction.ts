/**
 * useDeflectAttacksReaction — Deflect Attacks / Deflect Energy (SRD 5.2, Monk
 * L3/L13) reaction. A sibling hook composed directly in TurnHub (like
 * useTallyResolve) rather than nested inside useTurnActions (#1241) — keeps
 * that hook's own hook-count/complexity budget clear of a self-contained,
 * occasionally-used reaction; mirrors useManeuverDie's shape (owns its own
 * API call and busy/error state rather than routing through useTurnActions).
 *
 * The base reduction is free (no persisted resource, like the Warrior of Shadow
 * shadowStep reminder in actionResolvers.ts): the client rolls 1d10 + Dex + monk
 * level and never calls the transactions endpoint. Only the optional redirect —
 * once a ranged hit is reduced to 0 — spends 1 Focus, a real persisted spend.
 *
 * The pending-redirect flag resets itself off `reactionUsed` (turnState already
 * flips this back to false at start-of-turn / end-of-turn / end-of-combat), so
 * no caller needs to remember to reset it explicitly.
 */

import { useEffect, useState } from "react";

import { applyActionTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { rollSpec } from "@/lib/dice";
import {
  deflectAttacksReductionRoll,
  deflectAttacksRedirectRoll,
  formatDeflectAttacksMessage,
  formatDeflectAttacksRedirectMessage,
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
  /** True once the base roll fired and 1+ Focus remains — gates the Redirect button. */
  deflectRedirectAvailable: boolean;
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

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: () =>
      applyActionTransactions(character.id, [{ type: "executeAction", actionKey: "deflectAttacksRedirect" }]),
    toCharacter: ({ batchId, ...c }) => {
      void batchId;
      return c;
    },
    fallbackMessage: "Redirect failed.",
  });

  // Reuses deriveActions' own resourceKey gating (focus remaining >= 1) rather
  // than re-checking the pool here, same as every other resource-gated action.
  const redirectAction = availableActions.find((a) => a.key === "deflectAttacksRedirect");
  const deflectRedirectAvailable = pending && (redirectAction?.enabled ?? false);

  function handleDeflectAttacks() {
    if (mutation.isPending) return;
    consumeReaction();
    setShowReactionMenu(false);
    const roll = rollSpec(deflectAttacksReductionRoll(character));
    setReactionMessage(formatDeflectAttacksMessage(character, roll, redirectAction?.enabled ?? false));
    setPending(true);
  }

  async function handleDeflectAttacksRedirect() {
    if (!deflectRedirectAvailable || mutation.isPending) return;
    try {
      const updated = await mutation.mutateAsync(undefined);
      if (updated.batchId) attachBatchId(updated.batchId);
      const redirectRoll = rollSpec(deflectAttacksRedirectRoll(character));
      setReactionMessage((prev) => `${prev ?? ""} ${formatDeflectAttacksRedirectMessage(redirectRoll)}`.trim());
      setPending(false);
    } catch {
      // mutation.error already carries the message.
    }
  }

  return {
    deflectRedirectAvailable,
    busy: mutation.isPending,
    error: mutation.error,
    handleDeflectAttacks,
    handleDeflectAttacksRedirect,
  };
}
