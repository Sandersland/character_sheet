import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { formatModifier } from "@/lib/abilities";
import Popover from "@/components/ui/Popover";
import ArmorClassBreakdown from "@/features/character-meta/ArmorClassBreakdown";
import RollButton from "@/features/dice/RollButton";

const CHIP =
  "flex min-w-[68px] flex-col items-center justify-center rounded-control border border-parchment-200 bg-parchment-50 px-4 py-2 shadow-card";
const VALUE = "font-display text-xl font-semibold leading-none text-garnet-700";
const LABEL = "mt-1 text-[10px] font-semibold uppercase tracking-wide text-parchment-700";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={CHIP}>
      <span className={VALUE}>{value}</span>
      <span className={LABEL}>{label}</span>
    </div>
  );
}

export default function BannerVitals() {
  const { character } = useCurrentCharacter();
  return (
    <div className="flex flex-wrap gap-2">
      
      <Popover
        label="Armor Class breakdown"
        triggerClassName={`${CHIP} ${FOCUS}`}
        trigger={
          <>
            <span className={VALUE}>{character.armorClass}</span>
            <span className={LABEL}>Armor Class</span>
          </>
        }
      >
        <ArmorClassBreakdown />
      </Popover>

      
      <RollButton
        spec={{ count: 1, faces: 20, modifier: character.initiativeBonus }}
        label="Initiative"
        log={{ kind: "initiative", source: "Initiative" }}
        className={`${CHIP} ${FOCUS}`}
      >
        <span className={VALUE}>{formatModifier(character.initiativeBonus)}</span>
        <span className={LABEL}>Initiative</span>
      </RollButton>

      <StatChip label="Speed" value={`${character.speed} ft`} />

      
      {character.flySpeed !== undefined && <StatChip label="Fly Speed" value={`${character.flySpeed} ft`} />}

      <StatChip label="Proficiency" value={formatModifier(character.proficiencyBonus)} />
    </div>
  );
}
