/**
 * useDeflectAttacksReaction — Deflect Attacks (SRD 5.2, Monk L3/L13) /
 * Deflect Missiles (SRD 5.1, Monk L3, #1505) reaction. A sibling hook
 * composed directly in TurnHub (like useTallyResolve) rather than nested
 * inside useTurnActions (#1241) — keeps that hook's own hook-count/
 * complexity budget clear of a self-contained, occasionally-used reaction;
 * mirrors useManeuverDie's shape (owns its own API call and busy/error state
 * rather than routing through useTurnActions).
 *
 * The base reduction is free (no persisted resource, like the Warrior of Shadow
 * shadowStep reminder in actionResolvers.ts): the client rolls 1d10 + Dex + monk
 * level and never calls the transactions endpoint. Only the optional redirect —
 * once a ranged hit is reduced to 0 — spends a resource (1 Focus/2024, 1
 * ki/2014), a real persisted spend. Which base row and which redirect key are
 * live is read off `availableActions` (#1505) — a character is served exactly
 * one edition's pair, never both, so `deflectBaseAction` alone decides every
 * branch below.
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
  /** True once the base roll fired and the redirect's resource remains — gates the redirect button. */
  deflectRedirectAvailable: boolean;
  /** "Redirect · spend 1 Focus" (2024) / "Throw back · spend 1 ki" (2014) — read off the served row's own name + cost, not hardcoded per edition. */
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

  // Reuses deriveActions' own resourceKey gating (pool remaining >= its cost)
  // rather than re-checking the pool here, same as every other resource-gated action.
  const redirectAction = availableActions.find((a) => a.key === redirectKey);
  const deflectRedirectAvailable = pending && (redirectAction?.enabled ?? false);
  const redirectLabel = is2014 ? "Throw back · spend 1 ki" : "Redirect · spend 1 Focus";

  function handleDeflectAttacks() {
    const reductionSpec = deflectRollFromAction(baseAction);
    if (mutation.isPending || !baseAction || !reductionSpec) return;
    consumeReaction();
    setShowReactionMenu(false);
    const roll = rollSpec(reductionSpec);
    setReactionMessage(formatDeflectAttacksMessage(character, baseAction, roll, redirectAction?.enabled ?? false));
    setPending(true);
  }

  async function handleDeflectAttacksRedirect() {
    const redirectSpec = deflectRollFromAction(redirectAction);
    if (!deflectRedirectAvailable || mutation.isPending || !redirectSpec) return;
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
      // mutation.error already carries the message.
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
