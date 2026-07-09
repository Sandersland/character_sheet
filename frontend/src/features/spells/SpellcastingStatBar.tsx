// Save DC / Attack / Ability readout at the top of SpellsSection.
import { abilityAbbr, formatModifier } from "@/lib/abilities";
import type { AbilityName } from "@/types/character";

interface SpellcastingStatBarProps {
  spellSaveDC: number;
  spellAttackBonus: number;
  ability: AbilityName | undefined;
  abilityMod: number;
}

export default function SpellcastingStatBar({
  spellSaveDC,
  spellAttackBonus,
  ability,
  abilityMod,
}: SpellcastingStatBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-control bg-arcane-50 px-4 py-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
          Spell Save DC
        </p>
        <p className="font-display text-xl font-semibold text-arcane-900">{spellSaveDC}</p>
      </div>
      <div className="h-8 w-px bg-arcane-200" aria-hidden="true" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
          Spell Attack
        </p>
        <p className="font-display text-xl font-semibold text-arcane-900">
          {formatModifier(spellAttackBonus)}
        </p>
      </div>
      <div className="h-8 w-px bg-arcane-200" aria-hidden="true" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
          Ability
        </p>
        <p className="font-display text-xl font-semibold text-arcane-900">
          {ability ? abilityAbbr(ability) : "—"}
          <span className="ml-1 text-sm font-normal text-arcane-700">
            ({formatModifier(abilityMod)})
          </span>
        </p>
      </div>
    </div>
  );
}
