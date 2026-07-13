// One attack row (equipped weapon, unarmed, or improvised) driven by an
// AttackEntryView bundle from useAttackRolls.

import AttackRowInfo from "@/features/session/AttackRowInfo";
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

/** Plain damage button — the Crit checkbox is gone (#811): a nat 20 auto-doubles;
 *  manual crit calls live in the main sheet's verdict flow. */
function RowDamageButton({ view }: { view: AttackEntryView }) {
  const { lastAttackRoll, lastDamageRoll, damageTotal, isCrit } = view;
  const miss = isNaturalOne(lastAttackRoll);
  const filledTotal = lastDamageRoll ? damageTotal ?? lastDamageRoll.total : undefined;
  const label =
    filledTotal != null ? `Re-roll damage (${filledTotal})` : isCrit ? "Crit damage" : "Damage";
  return (
    <button
      type="button"
      onClick={view.onDamage}
      className={`rounded-control border px-2.5 py-1 text-xs font-semibold transition-colors ${
        isCrit
          ? "border-garnet-300 bg-garnet-100 text-garnet-800 hover:bg-garnet-200"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
      } ${miss && !isCrit ? "opacity-50" : ""}`}
    >
      {label}
    </button>
  );
}

export default function AttackRow({
  view,
  attacksExhausted,
  showManeuvers,
  character,
  riderTotals,
  onUpdate,
}: AttackRowProps) {
  const { entry, lastAttackRoll, lastDamageRoll, attackTotal, damageTotal } = view;
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
          <RowDamageButton view={view} />
        </div>
      </div>
      <DamageRiderList
        riders={entry.damageRiders}
        riderTotals={riderTotals}
        onDamageRider={view.onDamageRider}
      />
      {showManeuvers && (
        // A single combined row (off-hand TWF) hosts both maneuver halves (#809).
        <>
          <ManeuverPrompt
            section="attack"
            character={character}
            lastAttackRoll={lastAttackRoll}
            lastDamageRoll={lastDamageRoll}
            onRollsUpdated={view.onRollsUpdated}
            onUpdate={onUpdate}
          />
          <ManeuverPrompt
            section="damage"
            character={character}
            lastAttackRoll={lastAttackRoll}
            lastDamageRoll={lastDamageRoll}
            onRollsUpdated={view.onRollsUpdated}
            onUpdate={onUpdate}
          />
        </>
      )}
    </div>
  );
}
