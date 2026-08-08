// Damage-type / attack-vs-save / save-ability fields for the homebrew-spell
// form, shown only when the effect kind is "damage" (#1787). Split out of
// HomebrewSpellEffectFields to keep the parent's branch count down.
// Conditional nesting mirrors validateCustomSpellCoherence: saveAbility/
// saveEffect render only for attackType "save", so the fields a submission
// could carry always match what buildHomebrewSpellPayload actually sends.
import SpellAttackTypeSelect from "@/features/spells/SpellAttackTypeSelect";
import { ABILITY_OPTIONS } from "@/lib/abilities";
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";
import { DAMAGE_TYPES, damageTypeLabel } from "@/lib/damageTypes";
import type { HomebrewSpellInput } from "@/types/character";

interface HomebrewSpellDamageFieldsProps {
  draft: HomebrewSpellInput;
  update: (patch: Partial<HomebrewSpellInput>) => void;
}

export default function HomebrewSpellDamageFields({ draft, update }: HomebrewSpellDamageFieldsProps) {
  return (
    <>
      <label className="block">
        <span className={LABEL_CLS}>Damage type</span>
        <select
          className={INPUT_CLS}
          value={draft.damageType ?? ""}
          onChange={(e) => update({ damageType: e.target.value || undefined })}
        >
          <option value="">— none —</option>
          {DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>{damageTypeLabel(t)}</option>
          ))}
        </select>
      </label>
      <SpellAttackTypeSelect value={draft.attackType} onChange={(attackType) => update({ attackType })} />
      {draft.attackType === "save" && (
        <>
          <label className="block">
            <span className={LABEL_CLS}>Save ability</span>
            <select
              className={INPUT_CLS}
              value={draft.saveAbility ?? ""}
              onChange={(e) =>
                update({ saveAbility: (e.target.value || undefined) as HomebrewSpellInput["saveAbility"] })
              }
            >
              <option value="">— choose —</option>
              {ABILITY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>On a successful save</span>
            <select
              className={INPUT_CLS}
              value={draft.saveEffect ?? ""}
              onChange={(e) => update({ saveEffect: (e.target.value as "half" | "none") || undefined })}
            >
              <option value="">— unspecified —</option>
              <option value="half">Half damage</option>
              <option value="none">No effect</option>
            </select>
          </label>
        </>
      )}
    </>
  );
}
