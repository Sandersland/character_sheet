import CastStatFields from "@/features/entities/CastStatFields";
import type { CatalogSpell, ItemCapability } from "@/types/character";

interface CastStatSectionProps {
  cap: ItemCapability;
  index: number;
  spellAttackType: CatalogSpell["attackType"];
  spellcasterAttunable: boolean;
  onChange: (patch: Partial<ItemCapability>) => void;
}

// The Save DC / Attack bonus block for a castSpell: DC for save spells, attack
// for attack spells, neither for utility/buff spells (#363 fallout).
export default function CastStatSection({ cap, index, spellAttackType, spellcasterAttunable, onChange }: CastStatSectionProps) {
  const showDc = spellAttackType === "save";
  const showAttack = spellAttackType === "attack";
  if (!showDc && !showAttack) return null;
  return (
    <>
      {showDc && (
        <CastStatFields
          index={index}
          kind="dc"
          mode={cap.dcMode}
          value={cap.dcValue}
          fallbackValue={13}
          spellcasterAttunable={spellcasterAttunable}
          onMode={(dcMode) => onChange({ dcMode })}
          onValue={(dcValue) => onChange({ dcValue })}
        />
      )}

      {showAttack && (
        <CastStatFields
          index={index}
          kind="atk"
          mode={cap.attackMode}
          value={cap.attackValue}
          fallbackValue={5}
          spellcasterAttunable={spellcasterAttunable}
          onMode={(attackMode) => onChange({ attackMode })}
          onValue={(attackValue) => onChange({ attackValue })}
        />
      )}

      {!spellcasterAttunable && (
        <p className="text-[11px] text-parchment-500 sm:col-span-2">
          Wielder DC/attack needs the item attunable by a spellcaster; use fixed values otherwise.
        </p>
      )}
    </>
  );
}
