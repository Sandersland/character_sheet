// Optional auto-roll effect fields for the custom-spell form. The
// effect-kind/dice/modifier core is shared with HomebrewSpellEffectFields
// (#1787) via SpellEffectDiceFields — identical markup in both was flagged
// as duplication.
import CustomSpellDamageFields from "@/features/spells/CustomSpellDamageFields";
import SpellEffectDiceFields from "@/features/spells/SpellEffectDiceFields";
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";
import type { CustomSpellInput } from "@/types/character";

type Update = (patch: Partial<CustomSpellInput>) => void;

interface CustomSpellEffectFieldsProps {
  custom: CustomSpellInput;
  update: Update;
}

export default function CustomSpellEffectFields({ custom, update }: CustomSpellEffectFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <SpellEffectDiceFields draft={custom} update={update} />
      {custom.effectKind === "damage" && <CustomSpellDamageFields custom={custom} update={update} />}
      <label className="block">
        <span className={LABEL_CLS}>Upcast dice/level</span>
        <input type="number" min={0} className={INPUT_CLS} value={custom.upcastDicePerLevel ?? ""} onChange={(e) => update({ upcastDicePerLevel: Number(e.target.value) || undefined })} placeholder="0" />
      </label>
      {custom.level === 0 && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-parchment-700">
            <input type="checkbox" checked={!!custom.cantripScaling} onChange={(e) => update({ cantripScaling: e.target.checked })} />
            Cantrip scaling
          </label>
        </div>
      )}
    </div>
  );
}
