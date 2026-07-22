// Quivering Palm on the Attack sheet (#1245): a two-step vertical mirroring
// StunningStrikeSection's shape. SET rides an Unarmed Strike hit (spend 4
// focus — gated on currentRow, like Stunning Strike); once active, TRIGGER is
// a Magic action, so it consumes the Action slot directly here (this section
// only mounts inside the main Attack sheet, where the Action economy is
// already in scope — mirrors handleFlurryAction/handleTwfAction bypassing the
// generic dispatch to manage their own slot). Set/Trigger's state + the two
// server round-trips live in useQuiveringPalmActions so this file stays a flat
// JSX composition.

import { useQuiveringPalmActions } from "@/features/session/useQuiveringPalmActions";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

// Why Set/Trigger are disabled, in priority order — surfaced as their tooltip
// (mirrors OpenHandTechniqueSection's riderBlockedReason). Pulled out of the
// JSX so the component itself stays a flat composition.
function setBlockedReason(active: boolean, currentRow: AttackTallyRow | null): string | undefined {
  if (active) return "Vibrations already set";
  if (currentRow === null) return "Roll a hit first";
  return undefined;
}

function triggerBlockedReason(active: boolean): string | undefined {
  return active ? undefined : "No vibrations set";
}

interface QuiveringPalmSectionProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** The bound hit row Set rides on; null before a hit lands. */
  currentRow: AttackTallyRow | null;
  onUpdate: (c: Character) => void;
}

export default function QuiveringPalmSection({
  character,
  turnState,
  currentRow,
  onUpdate,
}: QuiveringPalmSectionProps) {
  const { quiveringPalm } = character;
  const { setDisabled, triggerDisabled, message, error, handleSet, handleTrigger } = useQuiveringPalmActions(
    character,
    turnState,
    currentRow,
    quiveringPalm?.active ?? false,
    onUpdate,
  );

  // Only a L17+ Warrior of the Open Hand has Quivering Palm.
  if (!quiveringPalm) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-800">Quivering Palm · DC {quiveringPalm.dc}</span>
        {quiveringPalm.active && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-parchment-500">
            Vibrations active
          </span>
        )}
      </div>
      <p className="text-xs text-parchment-700">
        Unarmed Strike hit only. Set spends 4 focus; Trigger is a Magic action.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={setDisabled}
          onClick={handleSet}
          title={setBlockedReason(quiveringPalm.active, currentRow)}
          className="rounded-control border border-gold-300 bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Set (4 focus)
        </button>
        <button
          type="button"
          disabled={triggerDisabled}
          onClick={handleTrigger}
          title={triggerBlockedReason(quiveringPalm.active)}
          className="rounded-control border border-gold-300 bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Trigger (Magic action)
        </button>
      </div>
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
      {message && <p className="text-xs font-semibold text-gold-800">{message}</p>}
    </div>
  );
}
