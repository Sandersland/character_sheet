// Neutral Damage card in the attack sheet: rolls damage for the active equipped
// weapon, auto-doubling the dice after a nat-20 to-hit. Ungated on the attack
// roll — you can roll damage before or after "Roll to hit". Hosts the active
// weapon's on-hit dice riders (Flame Tongue +2d6) and its Battle Master prompt.

import { GiSwordWound } from "@/components/ui/icons";
import AttackResultLine from "@/features/session/AttackResultLine";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import { isNaturalOne } from "@/lib/dice";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface WeaponDamageCardProps {
  entry: AttackEntry;
  showManeuvers: boolean;
  character: Character;
  damageTotal: number | null | undefined;
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  riderTotals: Record<string, number>;
  /** Effective crit (nat-20 to-hit OR manual toggle) — flips the Damage roll to doubled dice. */
  isCrit: boolean;
  /** Manual DM-called crit toggle state. */
  manualCrit: boolean;
  onDamage: (entry: AttackEntry) => void;
  onToggleCrit: () => void;
  onDamageRider: (rider: DamageRider) => void;
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
  onUpdate: (c: Character) => void;
}

export default function WeaponDamageCard({
  entry,
  showManeuvers,
  character,
  damageTotal,
  lastAttackRoll,
  lastDamageRoll,
  riderTotals,
  isCrit,
  manualCrit,
  onDamage,
  onToggleCrit,
  onDamageRider,
  onRollsUpdated,
  onUpdate,
}: WeaponDamageCardProps) {
  const miss = isNaturalOne(lastAttackRoll);
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-parchment-300 bg-parchment-50 p-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-parchment-200 text-parchment-600"
        >
          <GiSwordWound className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-parchment-900">Damage</span>
          <span className="block truncate text-xs text-parchment-600">
            Roll damage for your hit · {entry.damageLabel}
          </span>
        </span>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => onDamage(entry)}
            className={`rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isCrit
                ? "border-garnet-300 bg-garnet-100 text-garnet-800 hover:bg-garnet-200"
                : "border-parchment-300 bg-parchment-100 text-parchment-700 hover:bg-parchment-200"
            } ${miss && !isCrit ? "opacity-50" : ""}`}
          >
            {isCrit ? "Roll crit damage" : "Roll damage"}
          </button>
          <label className="flex items-center gap-1 text-[11px] text-parchment-500">
            <input
              type="checkbox"
              checked={manualCrit}
              onChange={onToggleCrit}
              className="h-3 w-3 accent-garnet-600"
            />
            Crit
          </label>
        </div>
      </div>
      {lastDamageRoll && (
        <AttackResultLine
          result={lastDamageRoll}
          kind="damage"
          damageType={entry.damageType}
          overrideTotal={damageTotal}
        />
      )}
      {entry.damageRiders.map((rider) => (
        <div key={rider.id} className="flex items-center justify-between pl-3">
          <p className="text-xs text-parchment-700">
            <span className="font-semibold text-gold-800">{rider.label}</span>
            {rider.condition && (
              <span className="ml-1 italic text-parchment-600">(when {rider.condition})</span>
            )}
            {riderTotals[rider.id] !== undefined && (
              <span className="ml-2 font-semibold text-gold-800">= {riderTotals[rider.id]}</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => onDamageRider(rider)}
            className="rounded-control border border-gold-200 bg-gold-50 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-100"
          >
            Roll {rider.label}
          </button>
        </div>
      ))}
      {showManeuvers && (
        <ManeuverPrompt
          character={character}
          lastAttackRoll={lastAttackRoll}
          lastDamageRoll={lastDamageRoll}
          onRollsUpdated={onRollsUpdated}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}
