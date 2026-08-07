// Shared spell-attack-vs-saving-throw dropdown — used by CustomSpellDamageFields
// (per-character inline spell) and HomebrewSpellDamageFields (catalog homebrew
// spell, #1787). Identical markup in both was flagged as duplication; this is
// the single source now.
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";

interface SpellAttackTypeSelectProps {
  value: "attack" | "save" | undefined;
  onChange: (attackType: "attack" | "save" | undefined) => void;
}

export default function SpellAttackTypeSelect({ value, onChange }: SpellAttackTypeSelectProps) {
  return (
    <label className="block">
      <span className={LABEL_CLS}>Attack type</span>
      <select
        className={INPUT_CLS}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value as "attack" | "save") || undefined)}
      >
        <option value="">— none —</option>
        <option value="attack">Spell attack</option>
        <option value="save">Saving throw</option>
      </select>
    </label>
  );
}
