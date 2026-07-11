// One attack row (equipped weapon, unarmed, or improvised) driven by an AttackEntry.

import AttackResultLine from "@/features/session/AttackResultLine";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
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
  /** Last rolled total per rider id (from InlineAttackPicker), shown inline. */
  riderTotals: Record<string, number>;
  onAttack: (entry: AttackEntry) => void;
  onDamage: (entry: AttackEntry) => void;
  onCritDamage: (entry: AttackEntry) => void;
  onDamageRider: (rider: DamageRider) => void;
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
  riderTotals,
  onAttack,
  onDamage,
  onCritDamage,
  onDamageRider,
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
          {/* Persistent roll results (#745) — supersede the old maneuver-only
              total lines; the die box + total stays visible after the toast. */}
          {lastAttackRoll && (
            <AttackResultLine result={lastAttackRoll} kind="attack" overrideTotal={attackTotal} />
          )}
          {lastDamageRoll && (
            <AttackResultLine
              result={lastDamageRoll}
              kind="damage"
              damageType={entry.damageType}
              overrideTotal={damageTotal}
            />
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
          <button
            type="button"
            onClick={() => onCritDamage(entry)}
            title="Critical hit — double the weapon damage dice"
            className="rounded-control border border-garnet-300 bg-garnet-100 px-2.5 py-1 text-xs font-semibold text-garnet-800 transition-colors hover:bg-garnet-200"
          >
            Critical
          </button>
        </div>
      </div>
      {/* On-hit dice riders (Flame Tongue +2d6 fire): each a separate typed term. */}
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
