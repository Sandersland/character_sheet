// Structured auto-roll effect fields for the homebrew-spell form (#1787):
// the shared effect-kind/dice/modifier core (SpellEffectDiceFields) plus, for
// effectKind "damage" only, the
// damage-specific fields (HomebrewSpellDamageFields — damage type,
// attack-vs-save, and save ability/effect). Conditional nesting mirrors
// validateCustomSpellCoherence, so the fields a submission could carry
// always match what buildHomebrewSpellPayload actually sends.
import HomebrewSpellDamageFields from "@/features/spells/HomebrewSpellDamageFields";
import SpellEffectDiceFields from "@/features/spells/SpellEffectDiceFields";
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";
import type { HomebrewSpellInput } from "@/types/character";

interface HomebrewSpellEffectFieldsProps {
  draft: HomebrewSpellInput;
  update: (patch: Partial<HomebrewSpellInput>) => void;
}

export default function HomebrewSpellEffectFields({ draft, update }: HomebrewSpellEffectFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <SpellEffectDiceFields draft={draft} update={update} />
      <label className="block">
        <span className={LABEL_CLS}>Upcast dice/level</span>
        <input
          type="number"
          min={0}
          className={INPUT_CLS}
          value={draft.upcastDicePerLevel ?? ""}
          onChange={(e) =>
            update({ upcastDicePerLevel: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          placeholder="0"
        />
      </label>
      {draft.effectKind === "damage" && <HomebrewSpellDamageFields draft={draft} update={update} />}
    </div>
  );
}
