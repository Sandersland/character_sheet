import RollButton from "@/features/dice/RollButton";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { formatModifier } from "@/lib/abilities";

const CELL = "flex flex-1 flex-col items-center px-1 py-1";
const VALUE = "font-display text-base font-semibold leading-none text-garnet-800";
const LABEL = "mt-1 text-[9px] font-semibold uppercase tracking-wide text-parchment-600";

export default function MobileQuickBar() {
  const { character } = useCurrentCharacter();
  return (
    <div className="flex divide-x divide-parchment-200 md:hidden">
      <div className={CELL}>
        <span className={VALUE}>{formatModifier(character.proficiencyBonus)}</span>
        <span className={LABEL}>Prof Bonus</span>
      </div>
      <div className={CELL}>
        <span className={VALUE}>{character.speed} ft</span>
        <span className={LABEL}>Speed</span>
      </div>
      <RollButton
        spec={{ count: 1, faces: 20, modifier: character.initiativeBonus }}
        label="Initiative"
        log={{ kind: "initiative", source: "Initiative" }}
        className={CELL}
      >
        <span className={VALUE}>{formatModifier(character.initiativeBonus)}</span>
        <span className={LABEL}>Initiative</span>
      </RollButton>
    </div>
  );
}
