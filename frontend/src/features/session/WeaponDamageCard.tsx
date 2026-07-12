// Neutral Damage card in the attack sheet: rolls damage (and a smaller Critical
// affordance) for the active equipped weapon. Ungated on the attack roll — you
// can roll damage before or after "Roll to hit". Hosts the active weapon's on-hit
// dice riders (Flame Tongue +2d6) and its Battle Master maneuver prompt.

import { GiSwordWound } from "@/components/ui/icons";
import AttackResultLine from "@/features/session/AttackResultLine";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
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
  onDamage: (entry: AttackEntry) => void;
  onCritDamage: (entry: AttackEntry) => void;
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
  onDamage,
  onCritDamage,
  onDamageRider,
  onRollsUpdated,
  onUpdate,
}: WeaponDamageCardProps) {
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
            Roll after you land the hit · {entry.damageLabel}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onDamage(entry)}
            className="rounded-control border border-parchment-300 bg-parchment-100 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-200"
          >
            Roll damage
          </button>
          <button
            type="button"
            onClick={() => onCritDamage(entry)}
            title="Critical hit — double the weapon damage dice"
            className="rounded-control border border-garnet-300 bg-garnet-100 px-2 py-1 text-[11px] font-semibold text-garnet-800 transition-colors hover:bg-garnet-200"
          >
            Critical
          </button>
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
