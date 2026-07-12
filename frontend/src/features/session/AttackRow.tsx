// One attack row (equipped weapon, unarmed, or improvised) driven by an
// AttackEntryView bundle from useAttackRolls.

import AttackRowInfo from "@/features/session/AttackRowInfo";
import CritDamageButton from "@/features/session/CritDamageButton";
import DamageRiderList from "@/features/session/DamageRiderList";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import { isNaturalOne } from "@/lib/dice";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { Character } from "@/types/character";

interface AttackRowProps {
  view: AttackEntryView;
  attacksExhausted: boolean;
  showManeuvers: boolean;
  character: Character;
  /** Last rolled total per rider id (from useAttackRolls), shown inline. */
  riderTotals: Record<string, number>;
  onUpdate: (c: Character) => void;
}

export default function AttackRow({
  view,
  attacksExhausted,
  showManeuvers,
  character,
  riderTotals,
  onUpdate,
}: AttackRowProps) {
  const { entry, lastAttackRoll, lastDamageRoll, attackTotal, damageTotal, isCrit, manualCrit } =
    view;
  const miss = isNaturalOne(lastAttackRoll);
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex items-center justify-between">
        <AttackRowInfo
          entry={entry}
          lastAttackRoll={lastAttackRoll}
          lastDamageRoll={lastDamageRoll}
          attackTotal={attackTotal}
          damageTotal={damageTotal}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={attacksExhausted}
            onClick={view.onAttack}
            title={attacksExhausted ? "No attacks remaining" : undefined}
            className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Attack
          </button>
          <CritDamageButton
            size="sm"
            isCrit={isCrit}
            manualCrit={manualCrit}
            miss={miss}
            onDamage={view.onDamage}
            onToggleCrit={view.onToggleCrit}
          />
        </div>
      </div>
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
