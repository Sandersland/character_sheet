// Rogue Sneak Attack on the attack card (#902): a manual eligibility toggle
// (advantage OR an ally adjacent — never auto-detected) plus a roll button.
// The roll is client-side and rides the swing's single resolveAction op as a
// damage rider (#1843) — the parent owns the roll (`onRoll`) and the rolled
// total (`rolled`); once-per-turn is turnState's guard.

import { useState } from "react";

import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";

// Why the roll button is disabled, in priority order — surfaced as its tooltip.
function rollBlockedReason(used: boolean, eligible: boolean): string | undefined {
  if (used) return "Already used this turn";
  if (!eligible) return "Confirm eligibility first";
  return undefined;
}

interface SneakAttackSectionProps {
  turnState: TurnState & TurnStateActions;
  /** The current hit row the roll folds into; null before a hit lands. */
  currentRow: AttackTallyRow | null;
  /** Rolls the sneak dice into the swing's rider map and marks the turn's use. */
  onRoll: () => void;
  /** The rolled rider total for this swing, if any. */
  rolled: number | null;
}

export default function SneakAttackSection({
  turnState,
  currentRow,
  onRoll,
  rolled,
}: SneakAttackSectionProps) {
  const { character } = useCurrentCharacter();
  const { sneakAttack } = character;
  const [eligible, setEligible] = useState(false);
  const used = turnState.sneakAttackUsedThisTurn;
  const canRoll = eligible && !used;

  // Only rogues have Sneak Attack; nothing to fold into until a hit lands.
  if (!sneakAttack || !currentRow) return null;

  const label = `${sneakAttack.dice.count}d${sneakAttack.dice.faces}`;

  function handleRoll() {
    if (!canRoll) return;
    onRoll();
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
          title={rollBlockedReason(used, eligible)}
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
