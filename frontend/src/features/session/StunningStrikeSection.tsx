import { useState } from "react";

import { attemptStunningStrikeTransaction } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character, StunningStrikeAttemptResult } from "@/types/character";

function attemptBlockedReason(currentRow: AttackTallyRow | null, used: boolean): string | undefined {
  if (currentRow === null) return "Roll a hit first";
  if (used) return "Already used this turn";
  return undefined;
}

function useStunningStrikeAttempt(
  character: Character,
  turnState: TurnState & TurnStateActions,
  currentRow: AttackTallyRow | null,
) {
  const [result, setResult] = useState<StunningStrikeAttemptResult | null>(null);
  const used = turnState.stunningStrikeUsedThisTurn;

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (usedThisTurn: boolean) => attemptStunningStrikeTransaction(character.id, usedThisTurn),
    toCharacter: (r) => r.character,
    fallbackMessage: "Failed to attempt Stunning Strike",
  });
  const canAttempt = !used && !mutation.isPending && currentRow !== null;

  async function handleAttempt() {
    if (!canAttempt) return;
    const { results } = await mutation.mutateAsync(used);
    setResult(results[0] ?? null);
    turnState.markStunningStrikeUsed();
  }

  return { used, canAttempt, result, handleAttempt };
}

interface StunningStrikeSectionProps {
  turnState: TurnState & TurnStateActions;
  currentRow: AttackTallyRow | null;
}

export default function StunningStrikeSection({
  turnState,
  currentRow,
}: StunningStrikeSectionProps) {
  const { character } = useCurrentCharacter();
  const { stunningStrike } = character;
  const { used, canAttempt, result, handleAttempt } = useStunningStrikeAttempt(
    character,
    turnState,
    currentRow,
  );

  if (!stunningStrike) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-800">
          Stunning Strike · DC {stunningStrike.saveDC}
        </span>
        {used && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-parchment-500">
            Used this turn
          </span>
        )}
      </div>
      <p className="text-xs text-parchment-700">
        Unarmed Strike or monk weapon hits only. Spends 1 focus for a Constitution
        save vs your focus DC.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canAttempt}
          onClick={handleAttempt}
          title={attemptBlockedReason(currentRow, used)}
          className="rounded-control border border-gold-300 bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Attempt Stunning Strike (1 focus)
        </button>
      </div>
      {result && (
        <p className="text-xs font-semibold text-gold-800">
          Rolled {result.roll} vs DC {result.dc} —{" "}
          {result.outcome === "fail"
            ? "failed: Stunned until the start of your next turn."
            : "made it: its speed is halved until the start of your next turn, and the next attack roll against it before then has advantage."}
        </p>
      )}
    </div>
  );
}
