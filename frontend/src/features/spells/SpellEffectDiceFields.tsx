// Shared effect-kind + dice-count/faces/modifier fields — the common core of
// HomebrewSpellEffectFields (catalog homebrew spell, #1787). A narrow
// structural prop type here — rather than importing the concrete
// HomebrewSpellInput — lets the consumer pass its own `update` straight through.
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";

interface EffectDiceDraft {
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
}

interface SpellEffectDiceFieldsProps {
  draft: EffectDiceDraft;
  update: (patch: Partial<EffectDiceDraft>) => void;
}

export default function SpellEffectDiceFields({ draft, update }: SpellEffectDiceFieldsProps) {
  return (
    <>
      <label className="block">
        <span className={LABEL_CLS}>Effect type</span>
        <select
          className={INPUT_CLS}
          value={draft.effectKind ?? ""}
          onChange={(e) => update({ effectKind: (e.target.value as "damage" | "heal") || undefined })}
        >
          <option value="">— none —</option>
          <option value="damage">Damage</option>
          <option value="heal">Healing</option>
        </select>
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Dice count</span>
        <input
          type="number"
          min={1}
          className={INPUT_CLS}
          value={draft.effectDiceCount ?? ""}
          onChange={(e) => update({ effectDiceCount: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="e.g. 8"
        />
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Dice faces</span>
        <input
          type="number"
          min={2}
          className={INPUT_CLS}
          value={draft.effectDiceFaces ?? ""}
          onChange={(e) => update({ effectDiceFaces: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="e.g. 6"
        />
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Flat modifier</span>
        <input
          type="number"
          className={INPUT_CLS}
          value={draft.effectModifier ?? ""}
          onChange={(e) => update({ effectModifier: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="0"
        />
      </label>
    </>
  );
}
