// Rogue Sneak Attack on the attack card (#902): a manual eligibility toggle
// (advantage OR an ally adjacent — never auto-detected) plus a roll button. The
// server rolls the level-derived Nd6 and enforces the once-per-turn guard; the
// roll folds into the current hit row's damage and is shown inline.

import { useState } from "react";

import { rollSneakAttackTransaction } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

// Why the roll button is disabled, in priority order — surfaced as its tooltip.
function rollBlockedReason(
  currentRow: AttackTallyRow | null,
  used: boolean,
  eligible: boolean,
): string | undefined {
  if (currentRow === null) return "Roll a hit first";
  if (used) return "Already used this turn";
  if (!eligible) return "Confirm eligibility first";
  return undefined;
}

// Roll state + the server round-trip: the server rolls the Nd6 and enforces
// once-per-turn; the result folds into the bound hit row's damage riders.
function useSneakAttackRoll(
  character: Character,
  turnState: TurnState & TurnStateActions,
  currentRow: AttackTallyRow | null,
  eligible: boolean,
) {
  const { setCharacter } = useCurrentCharacter();
  const [rolled, setRolled] = useState<number | null>(null);
  const used = turnState.sneakAttackUsedThisTurn;

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: () => rollSneakAttackTransaction(character.id, eligible, used),
    toCharacter: (r) => r.character,
    fallbackMessage: "Failed to roll Sneak Attack",
    onCharacterWritten: (r) => setCharacter(r.character),
  });
  const canRoll = eligible && !used && !mutation.isPending && currentRow !== null;

  // No try/catch (unchanged from pre-#1283): this hook has never surfaced an
  // error — a rejection propagates same as before.
  async function handleRoll() {
    if (!canRoll) return;
    const { results } = await mutation.mutateAsync(undefined);
    const roll = results[0]?.roll ?? 0;
    setRolled(roll);
    if (currentRow) turnState.addTallyDamageRider(currentRow.id, roll);
    turnState.markSneakAttackUsed();
  }

  return { used, canRoll, rolled, handleRoll };
}

interface SneakAttackSectionProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** The current hit row the roll folds into; null before a hit lands. */
  currentRow: AttackTallyRow | null;
}

export default function SneakAttackSection({
  character,
  turnState,
  currentRow,
}: SneakAttackSectionProps) {
  const { sneakAttack } = character;
  const [eligible, setEligible] = useState(false);
  const { used, canRoll, rolled, handleRoll } = useSneakAttackRoll(
    character,
    turnState,
    currentRow,
    eligible,
  );

  // Only rogues have Sneak Attack; nothing to fold into until a hit lands.
  if (!sneakAttack) return null;

  const label = `${sneakAttack.dice}d${sneakAttack.faces}`;

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
          title={rollBlockedReason(currentRow, used, eligible)}
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
