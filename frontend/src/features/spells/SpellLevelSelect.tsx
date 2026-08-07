// Shared 0-9 spell-level dropdown ("Cantrip" for 0) — used by CustomSpellForm
// (per-character inline spell) and HomebrewSpellForm (catalog homebrew spell,
// #1787). Identical markup in both was flagged as duplication; this is the
// single source now.
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";

interface SpellLevelSelectProps {
  id: string;
  value: number;
  onChange: (level: number) => void;
}

export default function SpellLevelSelect({ id, value, onChange }: SpellLevelSelectProps) {
  return (
    <div>
      <label className={LABEL_CLS} htmlFor={id}>Level</label>
      <select id={id} className={INPUT_CLS} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>Cantrip</option>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
          <option key={l} value={l}>Level {l}</option>
        ))}
      </select>
    </div>
  );
}
