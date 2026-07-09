// Damage-type / attack-vs-save fields, shown when the custom effect is damage.
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
      <label className="block">
        <span className={LABEL_CLS}>Attack type</span>
        <select className={INPUT_CLS} value={custom.attackType ?? ""} onChange={(e) => update({ attackType: (e.target.value as "attack" | "save") || undefined })}>
          <option value="">— none —</option>
          <option value="attack">Spell attack</option>
          <option value="save">Saving throw</option>
        </select>
      </label>
      {custom.attackType === "save" && (
        <label className="block">
          <span className={LABEL_CLS}>Save ability</span>
          <input className={INPUT_CLS} value={custom.saveAbility ?? ""} onChange={(e) => update({ saveAbility: e.target.value || undefined })} placeholder="dexterity" />
        </label>
      )}
    </>
  );
}
