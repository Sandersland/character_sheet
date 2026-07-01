import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import SkillsTable from "@/features/abilities/SkillsTable";
import Card from "@/components/ui/Card";
import { abilityAbbr, orderedAbilityEntries } from "@/lib/abilities";
import type { Character } from "@/types/character";

interface AbilityScoresPanelProps {
  character: Character;
}

export default function AbilityScoresPanel({ character }: AbilityScoresPanelProps) {
  // orderedAbilityEntries gives canonical 5e order (STR-DEX-CON-INT-WIS-CHA), not arbitrary key order.
  const abilityEntries = orderedAbilityEntries(character.abilityScores);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
      {/* lg:items-start on the parent stops grid align-items:stretch from ballooning this rail to the Skills card's height. */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:w-[16rem] lg:grid-cols-2 lg:gap-3">
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

      <Card title="Skills">
        <SkillsTable
          skills={character.skills}
          abilityScores={character.abilityScores}
          proficiencyBonus={character.proficiencyBonus}
        />
      </Card>
    </div>
  );
}
