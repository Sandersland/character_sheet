// Monk Stunning Strike on the attack card (#1242): once per turn, after hitting
// with an Unarmed Strike or monk weapon, spend 1 focus to force the target's
// Constitution save against the focus DC. The server rolls the save (flat
// d20 — the target's ability scores aren't tracked by this app, see
// stunning-strike.ts) and returns the fail(Stunned)/success(half-speed +
// next-attack advantage) outcome, surfaced inline exactly like SneakAttackSection — no
// toast: the app has no forced-result toast primitive (#956 retired the old
// RollResultToast in favor of the player-rolled-only RollResultSeal), so the
// result reads inline here plus the persisted session-log event.

import { useState } from "react";

import { attemptStunningStrikeTransaction } from "@/api/client";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character, StunningStrikeAttemptResult } from "@/types/character";

// Why the attempt button is disabled, in priority order — surfaced as its tooltip.
function attemptBlockedReason(currentRow: AttackTallyRow | null, used: boolean): string | undefined {
  if (currentRow === null) return "Roll a hit first";
  if (used) return "Already used this turn";
  return undefined;
}

// Attempt state + the server round-trip: the server spends 1 focus, rolls the
// target's save, and enforces once-per-turn; the result surfaces inline.
function useStunningStrikeAttempt(
  character: Character,
  turnState: TurnState & TurnStateActions,
  currentRow: AttackTallyRow | null,
  onUpdate: (c: Character) => void,
) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StunningStrikeAttemptResult | null>(null);
  const used = turnState.stunningStrikeUsedThisTurn;
  const canAttempt = !used && !busy && currentRow !== null;

  async function handleAttempt() {
    if (!canAttempt) return;
    setBusy(true);
    try {
      const { character: updated, results } = await attemptStunningStrikeTransaction(character.id, used);
      setResult(results[0] ?? null);
      turnState.markStunningStrikeUsed();
      onUpdate(updated);
    } finally {
      setBusy(false);
    }
  }

  return { used, canAttempt, result, handleAttempt };
}

interface StunningStrikeSectionProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** The bound hit row this attempt is riding on; null before a hit lands. */
  currentRow: AttackTallyRow | null;
  onUpdate: (c: Character) => void;
}

export default function StunningStrikeSection({
  character,
  turnState,
  currentRow,
  onUpdate,
}: StunningStrikeSectionProps) {
  const { stunningStrike } = character;
  const { used, canAttempt, result, handleAttempt } = useStunningStrikeAttempt(
    character,
    turnState,
    currentRow,
    onUpdate,
  );

  // Only monks (L5+) have Stunning Strike; nothing to attempt until a hit lands.
  if (!stunningStrike) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-800">
          Stunning Strike · DC {stunningStrike.dc}
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
