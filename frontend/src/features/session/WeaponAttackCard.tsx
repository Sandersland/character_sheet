// One equipped-weapon card in the attack sheet: OptionCard-style garnet tile,
// name + "to hit · damage" subtitle, and a solid "Roll to hit" button. Selecting
// the card (or rolling) makes it the active weapon the Damage card rolls for.

import { GiCrossedSwords } from "@/components/ui/icons";
import AttackResultLine from "@/features/session/AttackResultLine";
import type { AttackEntry } from "@/lib/attackMath";
import type { RollResult } from "@/lib/dice";

interface WeaponAttackCardProps {
  entry: AttackEntry;
  active: boolean;
  attacksExhausted: boolean;
  attackTotal: number | null | undefined;
  lastAttackRoll: RollResult | null;
  onSelect: () => void;
  onRollToHit: () => void;
}

export default function WeaponAttackCard({
  entry,
  active,
  attacksExhausted,
  attackTotal,
  lastAttackRoll,
  onSelect,
  onRollToHit,
}: WeaponAttackCardProps) {
  const ring = active ? "border-garnet-300 ring-1 ring-garnet-200" : "border-garnet-200";
  return (
    <div className={`rounded-card border bg-parchment-50 p-3 transition-colors ${ring}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Select ${entry.name}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
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
            </span>
          </span>
        </button>
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
