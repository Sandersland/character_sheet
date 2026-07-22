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
  onUpdate: (c: Character) => void;
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
  onUpdate,
  availableActions,
  reactionUsed,
  consumeReaction,
  setShowReactionMenu,
  setReactionMessage,
  attachBatchId,
}: UseDeflectAttacksReactionArgs): UseDeflectAttacksReactionReturn {
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reactionUsed) setPending(false);
  }, [reactionUsed]);

  // Reuses deriveActions' own resourceKey gating (focus remaining >= 1) rather
  // than re-checking the pool here, same as every other resource-gated action.
  const redirectAction = availableActions.find((a) => a.key === "deflectAttacksRedirect");
  const deflectRedirectAvailable = pending && (redirectAction?.enabled ?? false);

  function handleDeflectAttacks() {
    if (busy) return;
    setError(null);
    consumeReaction();
    setShowReactionMenu(false);
    const roll = rollSpec(deflectAttacksReductionRoll(character));
    setReactionMessage(formatDeflectAttacksMessage(character, roll, redirectAction?.enabled ?? false));
    setPending(true);
  }

  // fallow-ignore-next-line complexity -- CRAP is estimated from export references (no coverage data in the pre-commit static pass); this function is exercised end-to-end by TurnHub.test.tsx's redirect test and mirrors the same guard+try/catch/finally shape as the pre-existing handleActionSurge/send in useTurnActions.ts, which aren't flagged only because they predate this changeset
  async function handleDeflectAttacksRedirect() {
    if (!deflectRedirectAvailable || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await applyActionTransactions(character.id, [
        { type: "executeAction", actionKey: "deflectAttacksRedirect" },
      ]);
      onUpdate(updated);
      if (updated.batchId) attachBatchId(updated.batchId);
      const redirectRoll = rollSpec(deflectAttacksRedirectRoll(character));
      setReactionMessage((prev) => `${prev ?? ""} ${formatDeflectAttacksRedirectMessage(redirectRoll)}`.trim());
      setPending(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Redirect failed.");
    } finally {
      setBusy(false);
    }
  }

  return { deflectRedirectAvailable, busy, error, handleDeflectAttacks, handleDeflectAttacksRedirect };
}
