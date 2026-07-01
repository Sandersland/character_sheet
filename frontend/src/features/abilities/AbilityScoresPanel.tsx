import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import SkillsTable from "@/features/abilities/SkillsTable";
import Card from "@/components/ui/Card";
import { abilityAbbr, orderedAbilityEntries } from "@/lib/abilities";
import type { Character } from "@/types/character";

interface AbilityScoresPanelProps {
  character: Character;
}

export default function AbilityScoresPanel({ character }: AbilityScoresPanelProps) {
  // Render abilities in canonical 5e order (STR-DEX-CON-INT-WIS-CHA) via the
  // shared helper rather than raw object key order, which is arbitrary and
  // surprised D&D players (it read WIS-CHA-STR-DEX-CON-INT).
  const abilityEntries = orderedAbilityEntries(character.abilityScores);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
      {/* Ability scores rail — fixed intrinsic width per
          principles.md ("don't over-rely on grid systems" for
          elements with a natural fixed width). `lg:items-start` on
          the parent is the actual fix for box proportions: CSS
          grid's default `align-items: stretch` was forcing this
          rail to match the Skills card's full height (~660px) and
          distributing that across 3 rows, ballooning every box to
          ~210px tall regardless of column count or padding — 2x3
          vs 3x2 only changed how many rows split that same forced
          height. With `items-start` the rail sizes to its own
          content and each box sits near its natural ~120x100px. */}
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
