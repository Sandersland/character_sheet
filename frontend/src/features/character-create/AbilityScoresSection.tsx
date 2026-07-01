import AbilityScoreEditor from "@/features/abilities/AbilityScoreEditor";
import Card from "@/components/ui/Card";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";

interface AbilityScoresSectionProps {
  draft: CharacterDraft;
  update: (patch: Partial<CharacterDraft>) => void;
}

export default function AbilityScoresSection({ draft, update }: AbilityScoresSectionProps) {
  return (
    <Card title="Ability Scores" headingLevel={2}>
      <div className="p-4">
        <AbilityScoreEditor
          method={draft.abilityMethod}
          pool={draft.abilityPool}
          assignments={draft.abilityAssignments}
          abilityScores={draft.abilityScores}
          onMethodChange={(method, pool, assignments) =>
            update({ abilityMethod: method, abilityPool: pool, abilityAssignments: assignments })
          }
          onPoolChange={(pool) => update({ abilityPool: pool })}
          onAssignmentsChange={(assignments, scores) =>
            update({ abilityAssignments: assignments, abilityScores: scores })
          }
          onScoresChange={(scores) => update({ abilityScores: scores })}
        />
      </div>
    </Card>
  );
}
