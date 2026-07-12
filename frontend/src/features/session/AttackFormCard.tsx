// The single attack card (#786): an "Attacking with" form selector (deduped
// equipped weapons + Unarmed + Improvised), a live summary for the selected form,
// and one Roll-to-hit button. Rolling to hit binds the Damage card to the form.

import Segmented from "@/components/ui/Segmented";
import { GiCrossedSwords } from "@/components/ui/icons";
import AttackResultLine from "@/features/session/AttackResultLine";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { AttackEntry } from "@/lib/attackMath";

interface AttackFormCardProps {
  forms: AttackEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** View for the currently-selected form — drives the summary + inline result. */
  view: AttackEntryView;
  attacksExhausted: boolean;
  /** Rolls to hit with the selected form and binds the Damage card to it. */
  onRollToHit: () => void;
}

export default function AttackFormCard({
  forms,
  selectedId,
  onSelect,
  view,
  attacksExhausted,
  onRollToHit,
}: AttackFormCardProps) {
  const { entry, attackTotal, lastAttackRoll } = view;
  const options = forms.map((f) => ({ value: f.id, label: f.name }));
  return (
    <div className="flex flex-col gap-2 rounded-card border border-garnet-200 bg-parchment-50 p-3">
      <Segmented
        label="Attacking with"
        options={options}
        value={selectedId}
        onChange={onSelect}
      />
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-garnet-100 text-garnet-700"
        >
          <GiCrossedSwords className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-parchment-900">
            {entry.name}
            {entry.magical && (
              <span
                title="Counts as magical for overcoming resistance to nonmagical damage"
                className="rounded-control bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-800"
              >
                Magical
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-parchment-600">
            {entry.attackLabel} to hit · {entry.damageLabel}
            {entry.note && <span className="ml-1 italic">{entry.note}</span>}
          </span>
        </span>
        <button
          type="button"
          disabled={attacksExhausted}
          onClick={onRollToHit}
          title={attacksExhausted ? "No attacks remaining" : undefined}
          className="shrink-0 rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Roll to hit
        </button>
      </div>
      {lastAttackRoll && (
        <AttackResultLine result={lastAttackRoll} kind="attack" overrideTotal={attackTotal} />
      )}
    </div>
  );
}
