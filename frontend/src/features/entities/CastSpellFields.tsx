import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CastResourceFields from "@/features/entities/CastResourceFields";
import CastStatSection from "@/features/entities/CastStatSection";
import { applySpell } from "@/lib/capabilityDraft";
import type { CatalogSpell, ItemCapability } from "@/types/character";

interface CastSpellFieldsProps {
  cap: ItemCapability;
  index: number;
  spells: CatalogSpell[];
  spellcasterAttunable: boolean;
  onChange: (patch: Partial<ItemCapability>) => void;
}

// DM authoring for a castSpell capability (#528). Save DC / Attack fields are
// only shown for the referenced spell's roll kind — DC for save spells, attack
// for attack spells, neither for utility/buff spells (#363 fallout).
export default function CastSpellFields({ cap, index, spells, spellcasterAttunable, onChange }: CastSpellFieldsProps) {
  const spellAttackType = spells.find((s) => s.id === cap.spellId)?.attackType;

  function pickSpell(spellId: string) {
    const spell = spells.find((s) => s.id === spellId);
    if (spell) onChange(applySpell(cap, spell));
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Field label="Spell" htmlFor={`cap-${index}-spell`}>
        <Select id={`cap-${index}-spell`} value={cap.spellId ?? ""} onChange={(e) => pickSpell(e.target.value)}>
          <option value="" disabled>
            Choose a spell…
          </option>
          {spells.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (L{s.level})
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Cast at level" htmlFor={`cap-${index}-castlevel`}>
        <Input
          id={`cap-${index}-castlevel`}
          type="number"
          className="text-parchment-900"
          value={cap.castLevel ?? cap.spellLevel ?? 0}
          onChange={(e) => onChange({ castLevel: Number(e.target.value) })}
        />
      </Field>

      <CastResourceFields cap={cap} index={index} onChange={onChange} />

      <CastStatSection
        cap={cap}
        index={index}
        spellAttackType={spellAttackType}
        spellcasterAttunable={spellcasterAttunable}
        onChange={onChange}
      />
    </div>
  );
}
