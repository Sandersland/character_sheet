import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { abilityAbbr, orderedAbilityEntries } from "@/lib/abilities";

export default function AbilityScoresPanel() {
  const { character } = useCurrentCharacter();
  // Canonical 5e order (STR-DEX-CON-INT-WIS-CHA), not arbitrary key order.
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
