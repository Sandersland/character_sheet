// Neutral Damage card in the attack sheet: rolls damage for the active equipped
// weapon, auto-doubling the dice after a nat-20 to-hit. Ungated on the attack
// roll — you can roll damage before or after "Roll to hit". Hosts the active
// weapon's on-hit dice riders (Flame Tongue +2d6) and its Battle Master prompt.

import { GiSwordWound } from "@/components/ui/icons";
import AttackResultLine from "@/features/session/AttackResultLine";
import CritDamageButton from "@/features/session/CritDamageButton";
import DamageRiderList from "@/features/session/DamageRiderList";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import { isNaturalOne } from "@/lib/dice";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { Character } from "@/types/character";

interface WeaponDamageCardProps {
  view: AttackEntryView;
  showManeuvers: boolean;
  character: Character;
  riderTotals: Record<string, number>;
  onUpdate: (c: Character) => void;
}

export default function WeaponDamageCard({
  view,
  showManeuvers,
  character,
  riderTotals,
  onUpdate,
}: WeaponDamageCardProps) {
  const { entry, lastAttackRoll, lastDamageRoll, damageTotal, isCrit, manualCrit } = view;
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
        <CritDamageButton
          size="md"
          isCrit={isCrit}
          manualCrit={manualCrit}
          miss={miss}
          onDamage={view.onDamage}
          onToggleCrit={view.onToggleCrit}
        />
      </div>
      {lastDamageRoll && (
        <AttackResultLine
          result={lastDamageRoll}
          kind="damage"
          damageType={entry.damageType}
          overrideTotal={damageTotal}
        />
      )}
      <DamageRiderList
        riders={entry.damageRiders}
        riderTotals={riderTotals}
        onDamageRider={view.onDamageRider}
      />
      {showManeuvers && (
        <ManeuverPrompt
          character={character}
          lastAttackRoll={lastAttackRoll}
          lastDamageRoll={lastDamageRoll}
          onRollsUpdated={view.onRollsUpdated}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}
