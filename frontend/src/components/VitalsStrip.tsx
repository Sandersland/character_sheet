import { formatModifier } from "../lib/abilities";
import type { Character } from "../types/character";
import MeterBar from "./MeterBar";

interface VitalsStripProps {
  character: Character;
}

function VitalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)] px-3 py-3 shadow-[var(--shadow-card)]">
      <span className="font-display text-2xl font-semibold leading-none text-[var(--color-parchment-900)]">
        {value}
      </span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
        {label}
      </span>
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
      />
      <VitalStat label="Speed" value={`${character.speed} ft`} />
      <VitalStat
        label="Proficiency"
        value={formatModifier(character.proficiencyBonus)}
      />

      <div className="col-span-2 flex flex-col justify-center gap-1.5 rounded-[var(--radius-card)] border border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)] px-4 py-3 shadow-[var(--shadow-card)] sm:col-span-4 lg:col-span-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
            Hit Points
          </span>
          <span className="text-xs text-[var(--color-parchment-500)]">
            {hitDice.total}{hitDice.die}
          </span>
        </div>
        <p className="font-display text-xl font-semibold leading-none text-[var(--color-garnet-800)]">
          {hitPoints.current}
          <span className="text-sm font-normal text-[var(--color-parchment-500)]">
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
