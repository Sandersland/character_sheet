import { formatModifier } from "@/lib/abilities";
import RollButton from "@/features/dice/RollButton";
import type { Character } from "@/types/character";
import MeterBar from "@/components/ui/MeterBar";
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
 * single numbers (no value in a table here), HP gets a meter since it's
 * the one stat that actively depletes during play.
 */
export default function VitalsStrip({ character }: VitalsStripProps) {
  const { hitPoints, hitDice } = character;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
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

      <div className="col-span-2 flex flex-col justify-center gap-1.5 rounded-card border border-parchment-200 bg-parchment-50 px-4 py-3 shadow-card sm:col-span-4 lg:col-span-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            Hit Points
          </span>
          <span className="text-xs text-parchment-500">
            {hitDice.total - hitDice.spent}/{hitDice.total}{hitDice.die}
          </span>
        </div>
        <p className="font-display text-xl font-semibold leading-none text-garnet-800">
          {hitPoints.current}
          <span className="text-sm font-normal text-parchment-500">
            {" "}
            / {hitPoints.max}
            {hitPoints.temp > 0 && ` (+${hitPoints.temp})`}
          </span>
        </p>
        <MeterBar
          current={hitPoints.current}
          max={hitPoints.max}
          tone="garnet"
          label={`${hitPoints.current} of ${hitPoints.max} hit points`}
        />
      </div>
    </div>
  );
}
