// Optional auto-roll effect fields for the custom-spell form.
import CustomSpellDamageFields from "@/features/spells/CustomSpellDamageFields";
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
      <label className="block">
        <span className={LABEL_CLS}>Effect kind</span>
        <select
          className={INPUT_CLS}
          value={custom.effectKind ?? ""}
          onChange={(e) => update({ effectKind: (e.target.value as "damage" | "heal") || undefined })}
        >
          <option value="">— none —</option>
          <option value="damage">Damage</option>
          <option value="heal">Healing</option>
        </select>
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Dice count</span>
        <input type="number" min={1} className={INPUT_CLS} value={custom.effectDiceCount ?? ""} onChange={(e) => update({ effectDiceCount: Number(e.target.value) || undefined })} placeholder="e.g. 8" />
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Dice faces</span>
        <input type="number" min={2} className={INPUT_CLS} value={custom.effectDiceFaces ?? ""} onChange={(e) => update({ effectDiceFaces: Number(e.target.value) || undefined })} placeholder="e.g. 6" />
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Flat modifier</span>
        <input type="number" className={INPUT_CLS} value={custom.effectModifier ?? ""} onChange={(e) => update({ effectModifier: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="0" />
      </label>
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
