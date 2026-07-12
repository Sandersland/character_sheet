// Neutral Damage card in the attack sheet: rolls damage for the LAST ROLLED
// attack form, auto-doubling the dice after a nat-20 to-hit. Inert until a hit is
// rolled (`view` null); switching the attack-card selector only rebinds it on the
// next Roll to hit (#786). Hosts the form's on-hit dice riders (Flame Tongue +2d6)
// and its Battle Master prompt.

import { GiSwordWound } from "@/components/ui/icons";
import AttackResultLine from "@/features/session/AttackResultLine";
import CritDamageButton from "@/features/session/CritDamageButton";
import DamageRiderList from "@/features/session/DamageRiderList";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import { isNaturalOne } from "@/lib/dice";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { Character } from "@/types/character";

interface WeaponDamageCardProps {
  /** Last-rolled form's view, or null before any Roll to hit (inert state). */
  view: AttackEntryView | null;
  showManeuvers: boolean;
  character: Character;
  riderTotals: Record<string, number>;
  onUpdate: (c: Character) => void;
}

// Inert Damage card shown until the first Roll to hit picks a form to roll for.
function InertDamageCard() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-parchment-300 bg-parchment-50 p-3 opacity-60">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-parchment-200 text-parchment-600"
      >
        <GiSwordWound className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-parchment-900">Damage</span>
        <span className="block truncate text-xs text-parchment-600">
          Roll to hit first — then roll damage
        </span>
      </span>
      <button
        type="button"
        disabled
        className="shrink-0 cursor-not-allowed rounded-control border border-parchment-300 bg-parchment-100 px-3 py-1.5 text-xs font-semibold text-parchment-700 opacity-50"
      >
        Roll damage
      </button>
    </div>
  );
}

export default function WeaponDamageCard({
  view,
  showManeuvers,
  character,
  riderTotals,
  onUpdate,
}: WeaponDamageCardProps) {
  if (!view) return <InertDamageCard />;

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
            {entry.name} · {entry.damageLabel}
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
