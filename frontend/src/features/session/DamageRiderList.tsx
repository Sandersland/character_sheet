// On-hit dice riders (Flame Tongue +2d6 fire) for an attack row/card: each a
// separate typed term with its own Roll button. Shared by AttackRow and
// WeaponDamageCard so the two never drift (#778).

import type { DamageRider } from "@/lib/attackMath";

interface DamageRiderListProps {
  riders: DamageRider[];
  /** Last rolled total per rider id, shown inline. */
  riderTotals: Record<string, number>;
  onDamageRider: (rider: DamageRider) => void;
}

export default function DamageRiderList({ riders, riderTotals, onDamageRider }: DamageRiderListProps) {
  return (
    <>
      {riders.map((rider) => (
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
    </>
  );
}
