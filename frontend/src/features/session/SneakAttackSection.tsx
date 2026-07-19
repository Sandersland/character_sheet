// Rogue Sneak Attack on the attack card (#902): a manual eligibility toggle
// (advantage OR an ally adjacent — never auto-detected) plus a roll button. The
// server rolls the level-derived Nd6 and enforces the once-per-turn guard; the
// roll folds into the current hit row's damage and is shown inline.

import { useState } from "react";

import { rollSneakAttackTransaction } from "@/api/client";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

interface SneakAttackSectionProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** The current hit row the roll folds into; null before a hit lands. */
  currentRow: AttackTallyRow | null;
  onUpdate: (c: Character) => void;
}

export default function SneakAttackSection({
  character,
  turnState,
  currentRow,
  onUpdate,
}: SneakAttackSectionProps) {
  const { sneakAttack } = character;
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rolled, setRolled] = useState<number | null>(null);

  // Only rogues have Sneak Attack; nothing to fold into until a hit lands.
  if (!sneakAttack) return null;

  const used = turnState.sneakAttackUsedThisTurn;
  const label = `${sneakAttack.dice}d${sneakAttack.faces}`;
  const canRoll = eligible && !used && !busy && currentRow !== null;

  async function handleRoll() {
    if (!canRoll) return;
    setBusy(true);
    try {
      const { character: updated, results } = await rollSneakAttackTransaction(
        character.id,
        eligible,
        used,
      );
      const roll = results[0]?.roll ?? 0;
      setRolled(roll);
      if (currentRow) turnState.addTallyDamageRider(currentRow.id, roll);
      turnState.markSneakAttackUsed();
      onUpdate(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-800">Sneak Attack · {label}</span>
        {used && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-parchment-500">
            Used this turn
          </span>
        )}
      </div>
      <label className="flex items-start gap-2 text-xs text-parchment-700">
        <input
          type="checkbox"
          checked={eligible}
          disabled={used}
          onChange={(e) => setEligible(e.target.checked)}
          className="mt-0.5"
        />
        <span>You have advantage on the attack, or an ally is adjacent to the target.</span>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canRoll}
          onClick={handleRoll}
          title={
            currentRow === null
              ? "Roll a hit first"
              : used
                ? "Already used this turn"
                : !eligible
                  ? "Confirm eligibility first"
                  : undefined
          }
          className="rounded-control border border-gold-300 bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Roll Sneak Attack ({label})
        </button>
        {rolled !== null && (
          <span className="text-sm font-semibold text-gold-800">
            + {rolled} <span className="text-xs font-normal opacity-70">({label})</span>
          </span>
        )}
      </div>
    </div>
  );
}
