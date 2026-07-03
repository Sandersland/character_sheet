// One attack row (equipped weapon, unarmed, or improvised) driven by an AttackEntry.

import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import type { AttackEntry } from "@/lib/attackMath";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface AttackRowProps {
  entry: AttackEntry;
  attacksExhausted: boolean;
  showManeuvers: boolean;
  character: Character;
  attackTotal: number | null | undefined;
  damageTotal: number | null | undefined;
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  onAttack: (entry: AttackEntry) => void;
  onDamage: (entry: AttackEntry) => void;
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
  onUpdate: (c: Character) => void;
}

export default function AttackRow({
  entry,
  attacksExhausted,
  showManeuvers,
  character,
  attackTotal,
  damageTotal,
  lastAttackRoll,
  lastDamageRoll,
  onAttack,
  onDamage,
  onRollsUpdated,
  onUpdate,
}: AttackRowProps) {
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-parchment-900">
            {entry.name}
            {entry.magical && (
              <span
                title="Counts as magical for overcoming resistance to nonmagical damage"
                className="rounded-control bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-800"
              >
                Magical
              </span>
            )}
          </p>
          <p className="text-xs text-parchment-600">
            Attack: {entry.attackLabel} · Damage: {entry.damageLabel}
            {entry.note && (
              <span className="ml-1 italic text-parchment-600">{entry.note}</span>
            )}
          </p>
          {attackTotal !== null && attackTotal !== undefined && (
            <p className="text-xs font-semibold text-gold-800">
              Attack total: {attackTotal} <span className="font-normal opacity-70">(+maneuver)</span>
            </p>
          )}
          {damageTotal !== null && damageTotal !== undefined && (
            <p className="text-xs font-semibold text-gold-800">
              Damage total: {damageTotal} <span className="font-normal opacity-70">(+maneuver)</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={attacksExhausted}
            onClick={() => onAttack(entry)}
            title={attacksExhausted ? "No attacks remaining" : undefined}
            className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Attack
          </button>
          <button
            type="button"
            onClick={() => onDamage(entry)}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            Damage
          </button>
        </div>
      </div>
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
