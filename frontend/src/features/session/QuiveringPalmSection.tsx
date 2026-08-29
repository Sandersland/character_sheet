// TRIGGER consumes the Action slot directly here rather than through the
// generic dispatch, since this section only mounts inside the Attack sheet
// where the Action economy is already in scope — mirrors
// handleFlurryAction/handleTwfAction managing their own slot.

import { useQuiveringPalmActions } from "@/features/session/useQuiveringPalmActions";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { AttackTallyRow } from "@/lib/attackTallySummary";

function setBlockedReason(active: boolean, currentRow: AttackTallyRow | null): string | undefined {
  if (active) return "Vibrations already set";
  if (currentRow === null) return "Roll a hit first";
  return undefined;
}

function triggerBlockedReason(active: boolean): string | undefined {
  return active ? undefined : "No vibrations set";
}

interface QuiveringPalmSectionProps {
  turnState: TurnState & TurnStateActions;
  currentRow: AttackTallyRow | null;
}

export default function QuiveringPalmSection({
  turnState,
  currentRow,
}: QuiveringPalmSectionProps) {
  const { character } = useCurrentCharacter();
  const { quiveringPalm } = character;
  // quiveringPalm.active is optional (#1316) — false, not absent, when vibrations aren't set.
  const active = quiveringPalm?.active ?? false;
  const { setDisabled, triggerDisabled, message, error, handleSet, handleTrigger } = useQuiveringPalmActions(
    character,
    turnState,
    currentRow,
    active,
  );

  if (!quiveringPalm) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-800">Quivering Palm · DC {quiveringPalm.saveDC}</span>
        {active && (
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
          title={setBlockedReason(active, currentRow)}
          className="rounded-control border border-gold-300 bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Set (4 focus)
        </button>
        <button
          type="button"
          disabled={triggerDisabled}
          onClick={handleTrigger}
          title={triggerBlockedReason(active)}
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
