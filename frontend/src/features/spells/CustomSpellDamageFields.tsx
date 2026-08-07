// Damage-type / attack-vs-save fields, shown when the custom effect is
// damage. The attack-type select is shared with HomebrewSpellDamageFields
// (#1787) via SpellAttackTypeSelect — identical markup in both was flagged
// as duplication.
import SpellAttackTypeSelect from "@/features/spells/SpellAttackTypeSelect";
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";
import type { CustomSpellInput } from "@/types/character";

interface CustomSpellDamageFieldsProps {
  custom: CustomSpellInput;
  update: (patch: Partial<CustomSpellInput>) => void;
}

export default function CustomSpellDamageFields({ custom, update }: CustomSpellDamageFieldsProps) {
  return (
    <>
      <label className="block">
        <span className={LABEL_CLS}>Damage type</span>
        <input className={INPUT_CLS} value={custom.damageType ?? ""} onChange={(e) => update({ damageType: e.target.value || undefined })} placeholder="fire" />
      </label>
      <SpellAttackTypeSelect value={custom.attackType} onChange={(attackType) => update({ attackType })} />
      {custom.attackType === "save" && (
        <label className="block">
          <span className={LABEL_CLS}>Save ability</span>
          <input className={INPUT_CLS} value={custom.saveAbility ?? ""} onChange={(e) => update({ saveAbility: e.target.value || undefined })} placeholder="dexterity" />
        </label>
      )}
    </>
  );
}
