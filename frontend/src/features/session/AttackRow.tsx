// One attack row (equipped weapon, unarmed, or improvised) driven by an AttackEntry.

import AttackResultLine from "@/features/session/AttackResultLine";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import { isNaturalOne } from "@/lib/dice";
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
  /** Effective crit (nat-20 to-hit OR manual toggle) — flips the Damage roll to doubled dice. */
  isCrit: boolean;
  /** Manual DM-called crit toggle state. */
  manualCrit: boolean;
  onAttack: (entry: AttackEntry) => void;
  onDamage: (entry: AttackEntry) => void;
  onToggleCrit: () => void;
  onDamageRider: (rider: DamageRider) => void;
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
  onUpdate: (c: Character) => void;
}

// fallow-ignore-next-line complexity -- #766 grew this past the gate; decomposition tracked in #778
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
  isCrit,
  manualCrit,
  onAttack,
  onDamage,
  onToggleCrit,
  onDamageRider,
  onRollsUpdated,
  onUpdate,
}: AttackRowProps) {
  const miss = isNaturalOne(lastAttackRoll);
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
          {/* Persistent roll results — the die box + total stay on the row after
              the transient 3D-dice animation + toast fade. */}
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
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => onDamage(entry)}
              className={`rounded-control border px-2.5 py-1 text-xs font-semibold transition-colors ${
                isCrit
                  ? "border-garnet-300 bg-garnet-100 text-garnet-800 hover:bg-garnet-200"
                  : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
              } ${miss && !isCrit ? "opacity-50" : ""}`}
            >
              {isCrit ? "Crit damage" : "Damage"}
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
