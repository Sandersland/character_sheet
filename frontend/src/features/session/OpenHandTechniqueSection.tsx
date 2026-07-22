// Open Hand Technique on the Flurry-of-Blows sheet (#1245): a Flurry hit
// rider, mirrors StunningStrikeSection's shape but with 3 mutually exclusive
// choices instead of one button. Addle never rolls (no save — always applies);
// Push/Topple roll a flat d20 vs the focus DC server-side (no NPC combatant,
// same simplification as Stunning Strike — see open-hand-technique.ts).

import { useState } from "react";

import { imposeOpenHandRiderTransaction } from "@/api/client";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character, OpenHandRider, OpenHandRiderResult } from "@/types/character";

const RIDER_LABELS: Record<OpenHandRider, string> = {
  addle: "Addle",
  push: "Push",
  topple: "Topple",
};

// Why the rider buttons are disabled, in priority order — surfaced as their tooltip.
function riderBlockedReason(currentRow: AttackTallyRow | null, used: boolean): string | undefined {
  if (currentRow === null) return "Roll a hit first";
  if (used) return "Already used this turn";
  return undefined;
}

interface OpenHandTechniqueSectionProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** The bound Flurry hit row this rider rides on; null before a hit lands. */
  currentRow: AttackTallyRow | null;
  onUpdate: (c: Character) => void;
}

export default function OpenHandTechniqueSection({
  character,
  turnState,
  currentRow,
  onUpdate,
}: OpenHandTechniqueSectionProps) {
  const { openHandTechnique } = character;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OpenHandRiderResult | null>(null);
  const used = turnState.openHandRiderUsedThisTurn;
  const canImpose = !used && !busy && currentRow !== null;

  // Only a L3+ Warrior of the Open Hand has Open Hand Technique.
  if (!openHandTechnique) return null;

  async function handleImpose(rider: OpenHandRider) {
    if (!canImpose) return;
    setBusy(true);
    try {
      const { character: updated, results } = await imposeOpenHandRiderTransaction(character.id, rider, used);
      setResult(results[0] ?? null);
      turnState.markOpenHandRiderUsed();
      onUpdate(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-800">
          Open Hand Technique · DC {openHandTechnique.dc}
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
