import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import { abilityAbbr, orderedAbilityEntries } from "@/lib/abilities";
import type { Character } from "@/types/character";

interface AbilityScoresPanelProps {
  character: Character;
}

// The abilities + saves row across the top of the Overview tab. Skills are NOT
// here — the inline all-18 AllSkillsCard owns them.
export default function AbilityScoresPanel({ character }: AbilityScoresPanelProps) {
  // orderedAbilityEntries gives canonical 5e order (STR-DEX-CON-INT-WIS-CHA), not arbitrary key order.
  const abilityEntries = orderedAbilityEntries(character.abilityScores);

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {abilityEntries.map(([key, score]) => (
        <AbilityScoreBox
          key={key}
          ability={key}
          label={abilityAbbr(key)}
          score={score}
          saveProficient={character.savingThrowProficiencies.includes(key)}
          proficiencyBonus={character.proficiencyBonus}
        />
      ))}
    </div>
  );
}
