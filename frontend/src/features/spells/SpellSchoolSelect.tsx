import { INPUT_CLS, LABEL_CLS, SPELL_SCHOOLS } from "@/lib/addSpell";
import type { SpellSchool } from "@/types/character";

interface SpellSchoolSelectProps {
  id: string;
  value: SpellSchool;
  onChange: (school: SpellSchool) => void;
}

export default function SpellSchoolSelect({ id, value, onChange }: SpellSchoolSelectProps) {
  return (
    <div>
      <label className={LABEL_CLS} htmlFor={id}>School</label>
      <select id={id} className={INPUT_CLS} value={value} onChange={(e) => onChange(e.target.value as SpellSchool)}>
        {SPELL_SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
