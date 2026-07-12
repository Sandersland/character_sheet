/**
 * SpellAttackRow — one attack-roll cantrip row in the attack sheet (#734).
 *
 * Presentational: the two-step "Attack {+bonus}" → "Cast" pattern (Cast gated
 * until the to-hit is rolled), plus persistent die boxes (#745). A spell attack
 * is a single transactional cast, NOT an Extra-Attack swing — no maneuvers here.
 */

import AttackResultLine from "@/features/session/AttackResultLine";
import { formatModifier } from "@/lib/abilities";
import type { RollResult } from "@/lib/dice";
import type { Spell } from "@/types/character";

interface SpellAttackRowProps {
  spell: Spell;
  attackBonus: number;
  /** Formatted damage spec, e.g. "1d10 fire". */
  damageLabel: string;
  /** True once the to-hit d20 has been rolled — gates Cast. */
  attackRolled: boolean;
  busy: boolean;
  lastAttack: RollResult | null;
  lastDamage: RollResult | null;
  onAttack: () => void;
  onCast: () => void;
}

export default function SpellAttackRow({
  spell,
  attackBonus,
  damageLabel,
  attackRolled,
  busy,
  lastAttack,
  lastDamage,
  onAttack,
  onCast,
}: SpellAttackRowProps) {
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-parchment-900">{spell.name}</p>
          <p className="text-xs text-parchment-600">
            Spell attack {formatModifier(attackBonus)} · {damageLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAttack}
            disabled={busy || attackRolled}
            className="rounded-control border border-garnet-300 bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
          >
            Attack {formatModifier(attackBonus)}
          </button>
          <button
            type="button"
            onClick={onCast}
            disabled={busy || !attackRolled}
            title={attackRolled ? undefined : "Roll the spell attack first"}
            className="rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-100 disabled:opacity-50"
          >
            Cast
          </button>
        </div>
      </div>
      {lastAttack && <AttackResultLine result={lastAttack} kind="attack" />}
      {lastDamage && (
        <AttackResultLine result={lastDamage} kind="damage" damageType={spell.damageType ?? undefined} />
      )}
    </div>
  );
}
