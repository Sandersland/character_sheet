import { useState } from "react";

import { imposeOpenHandRiderTransaction } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { OpenHandRider, OpenHandRiderResult } from "@/types/character";

const RIDER_LABELS: Record<OpenHandRider, string> = {
  addle: "Addle",
  push: "Push",
  topple: "Topple",
};

function riderBlockedReason(currentRow: AttackTallyRow | null, used: boolean): string | undefined {
  if (currentRow === null) return "Roll a hit first";
  if (used) return "Already used this turn";
  return undefined;
}

interface OpenHandTechniqueSectionProps {
  turnState: TurnState & TurnStateActions;
  currentRow: AttackTallyRow | null;
}

export default function OpenHandTechniqueSection({
  turnState,
  currentRow,
}: OpenHandTechniqueSectionProps) {
  const { character } = useCurrentCharacter();
  const { openHandTechnique } = character;
  const [result, setResult] = useState<OpenHandRiderResult | null>(null);
  const used = turnState.openHandRiderUsedThisTurn;
  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (rider: OpenHandRider) => imposeOpenHandRiderTransaction(character.id, rider, used),
    toCharacter: (r) => r.character,
    fallbackMessage: "Failed to impose Open Hand Technique rider",
  });
  const canImpose = !used && !mutation.isPending && currentRow !== null;

  if (!openHandTechnique) return null;

  // No try/catch: this handler has never surfaced errors — a rejected mutation propagates uncaught.
  async function handleImpose(rider: OpenHandRider) {
    if (!canImpose) return;
    const { results } = await mutation.mutateAsync(rider);
    setResult(results[0] ?? null);
    turnState.markOpenHandRiderUsed();
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-800">
          Open Hand Technique · DC {openHandTechnique.saveDC}
        </span>
        {used && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-parchment-500">
            Used this turn
          </span>
        )}
      </div>
      <p className="text-xs text-parchment-700">
        Flurry of Blows hits only. Addle has no save; Push (Strength) / Topple (Dexterity) vs your focus DC.
      </p>
      <div className="flex items-center gap-2">
        {(Object.keys(RIDER_LABELS) as OpenHandRider[]).map((rider) => (
          <button
            key={rider}
            type="button"
            disabled={!canImpose}
            onClick={() => handleImpose(rider)}
            title={riderBlockedReason(currentRow, used)}
            className="rounded-control border border-gold-300 bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {RIDER_LABELS[rider]}
          </button>
        ))}
      </div>
      {result && <p className="text-xs font-semibold text-gold-800">{result.summary}</p>}
    </div>
  );
}
