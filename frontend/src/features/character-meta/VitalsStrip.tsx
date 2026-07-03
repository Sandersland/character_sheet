import { formatModifier } from "@/lib/abilities";
import Popover from "@/components/ui/Popover";
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
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
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
// Read-only AC tile: derived server-side; clicking discloses the labeled breakdown.
function ArmorClassStat({ character }: { character: Character }) {
  return (
    <Popover
      label="Armor Class breakdown"
      triggerClassName="h-full w-full flex flex-col items-center justify-center rounded-card border border-parchment-200 bg-parchment-50 px-3 py-3 shadow-card"
      trigger={
        <>
          <span className="font-display text-2xl font-semibold leading-none text-parchment-900">
            {character.armorClass}
          </span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Armor Class
          </span>
        </>
      }
    >
      <dl className="px-3 py-2 text-sm">
        {character.armorClassBreakdown.map((part, i) => (
          <div key={`${part.label}-${i}`} className="flex items-center justify-between gap-4 py-0.5">
            <dt className="text-parchment-700">{part.label}</dt>
            <dd className="font-semibold tabular-nums text-parchment-900">
              {/* deriveArmorClassParts always emits the base (armor/unarmored) part first. */}
              {i === 0 ? part.value : formatModifier(part.value)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-parchment-200 pt-1">
          <dt className="font-semibold text-parchment-800">Total</dt>
          <dd className="font-semibold tabular-nums text-parchment-900">{character.armorClass}</dd>
        </div>
      </dl>
    </Popover>
  );
}

export default function VitalsStrip({ character }: VitalsStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ArmorClassStat character={character} />
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
