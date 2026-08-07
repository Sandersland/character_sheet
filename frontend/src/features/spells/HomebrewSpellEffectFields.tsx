// Structured auto-roll effect fields for the homebrew-spell form (#1787):
// the shared effect-kind/dice/modifier core (SpellEffectDiceFields, also used
// by CustomSpellEffectFields) plus, for effectKind "damage" only, the
// damage-specific fields (HomebrewSpellDamageFields — damage type,
// attack-vs-save, and save ability/effect). Conditional nesting mirrors
// validateCustomSpellCoherence (backend/src/lib/spellcasting/
// custom-spell-validation.ts), so the fields a submission could carry always
// match what buildHomebrewSpellPayload (lib/homebrewSpell.ts) actually sends.
import HomebrewSpellDamageFields from "@/features/spells/HomebrewSpellDamageFields";
import SpellEffectDiceFields from "@/features/spells/SpellEffectDiceFields";
import type { HomebrewSpellInput } from "@/types/character";

interface HomebrewSpellEffectFieldsProps {
  draft: HomebrewSpellInput;
  update: (patch: Partial<HomebrewSpellInput>) => void;
}

export default function HomebrewSpellEffectFields({ draft, update }: HomebrewSpellEffectFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <SpellEffectDiceFields draft={draft} update={update} />
      {draft.effectKind === "damage" && <HomebrewSpellDamageFields draft={draft} update={update} />}
    </div>
  );
}
