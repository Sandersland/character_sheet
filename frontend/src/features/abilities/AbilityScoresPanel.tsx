import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import { abilityAbbr, orderedAbilityEntries } from "@/lib/abilities";
import type { Character } from "@/types/character";

interface AbilityScoresPanelProps {
  character: Character;
  /**
   * Grid template for the boxes. Defaults to the Overview's wide row
   * (`grid-cols-3 sm:grid-cols-6`); a narrow host (the desktop Combat left rail,
   * #964) passes `grid-cols-3` so the boxes stay legible in ~18rem.
   */
  gridClassName?: string;
}

// The abilities + saves row across the top of the Overview tab. Skills are NOT
// here — the inline all-18 AllSkillsCard owns them.
export default function AbilityScoresPanel({
  character,
  gridClassName = "grid-cols-3 sm:grid-cols-6",
}: AbilityScoresPanelProps) {
  // orderedAbilityEntries gives canonical 5e order (STR-DEX-CON-INT-WIS-CHA), not arbitrary key order.
  const abilityEntries = orderedAbilityEntries(character.abilityScores);

  return (
    <div className={`grid gap-3 ${gridClassName}`}>
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
