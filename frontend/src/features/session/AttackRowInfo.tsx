// Left column of an AttackRow: name + magical badge, the attack/damage summary
// line, and the persistent inline roll results (#778).

import AttackResultLine from "@/features/session/AttackResultLine";
import type { AttackEntry } from "@/lib/attackMath";
import type { RollResult } from "@/lib/dice";

interface AttackRowInfoProps {
  entry: AttackEntry;
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  attackTotal: number | null | undefined;
  damageTotal: number | null | undefined;
}

export default function AttackRowInfo({
  entry,
  lastAttackRoll,
  lastDamageRoll,
  attackTotal,
  damageTotal,
}: AttackRowInfoProps) {
  return (
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
  );
}
