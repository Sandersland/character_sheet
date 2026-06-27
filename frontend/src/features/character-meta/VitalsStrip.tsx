import { formatModifier } from "@/lib/abilities";
import RollButton from "@/features/dice/RollButton";
import type { Character } from "@/types/character";
import type { RollSpec } from "@/lib/dice";

interface VitalsStripProps {
  character: Character;
}

function VitalStat({
  label,
  value,
  rollSpec,
}: {
  label: string;
  value: string;
  rollSpec?: RollSpec;
}) {
  const content = (
    <>
      <span className="font-display text-2xl font-semibold leading-none text-parchment-900">
        {value}
      </span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
        {label}
      </span>
    </>
  );

  if (rollSpec) {
    return (
      <RollButton
        spec={rollSpec}
        label={label}
        className="flex flex-col items-center justify-center rounded-card border border-parchment-200 bg-parchment-50 px-3 py-3 shadow-card"
      >
        {content}
      </RollButton>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-parchment-200 bg-parchment-50 px-3 py-3 shadow-card">
      {content}
    </div>
  );
}

/**
 * The "vitals strip" — AC / Initiative / Speed / Proficiency are terse
 * single numbers (no value in a table here). HP is intentionally absent:
 * the HitPointTracker panel owns the live, depleting HP readout, so
 * duplicating it here would be a second source of truth.
 */
export default function VitalsStrip({ character }: VitalsStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <VitalStat label="Armor Class" value={String(character.armorClass)} />
      <VitalStat
        label="Initiative"
        value={formatModifier(character.initiativeBonus)}
        rollSpec={{ count: 1, faces: 20, modifier: character.initiativeBonus }}
      />
      <VitalStat label="Speed" value={`${character.speed} ft`} />
      <VitalStat
        label="Proficiency"
        value={formatModifier(character.proficiencyBonus)}
      />
    </div>
  );
}
