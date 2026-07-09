import { fightingStyleLabel, FIGHTING_STYLE_DESCRIPTIONS } from "@/lib/fightingStyles";
import type { FightingStyleKey } from "@/types/character";
import FightingStylePanel from "@/features/class/FightingStylePanel";

interface Props {
  fightingStyle: FightingStyleKey | null;
  busy: boolean;
  onChoose: (key: FightingStyleKey) => void;
}

export default function FightingStyleSection({ fightingStyle, busy, onChoose }: Props) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Fighting Style
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {fightingStyle ? (
        <div className="mb-3">
          <p className="text-sm font-semibold text-parchment-900">
            {fightingStyleLabel(fightingStyle)}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">
            {FIGHTING_STYLE_DESCRIPTIONS[fightingStyle]}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-parchment-600">Choose a fighting style specialty.</p>
      )}

      <FightingStylePanel current={fightingStyle} busy={busy} onChoose={onChoose} />
    </div>
  );
}
