import { useState } from "react";

import SkillsTable from "@/features/abilities/SkillsTable";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { abilityAbbr, formatModifier, skillBonus, skillLabel } from "@/lib/abilities";
import { proficientSkills } from "@/lib/overviewSkills";
import type { AbilityScores, Skill } from "@/types/character";

interface ProficientSkillsCardProps {
  skills: Skill[];
  abilityScores: AbilityScores;
  proficiencyBonus: number;
}

// Curated Overview summary: proficient/expertise skills only, with an "All 18 →"
// expander that opens the full SkillsTable in a modal.
export default function ProficientSkillsCard({
  skills,
  abilityScores,
  proficiencyBonus,
}: ProficientSkillsCardProps) {
  const [showAll, setShowAll] = useState(false);
  const proficient = proficientSkills(skills);

  return (
    <Card
      title="Proficient Skills"
      titleAccessory={
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs font-semibold text-garnet-700 hover:underline"
        >
          All {skills.length} →
        </button>
      }
    >
      {proficient.length === 0 ? (
        <p className="px-4 py-3 text-sm text-parchment-600">No skill proficiencies.</p>
      ) : (
        <ul className="divide-y divide-parchment-200">
          {proficient.map((skill) => {
            const bonus = skillBonus(
              abilityScores[skill.ability],
              proficiencyBonus,
              skill.proficient,
              skill.expertise,
              skill.tempModifier ?? 0
            );
            return (
              <li key={skill.name} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                <span
                  className={`block h-2 w-2 shrink-0 rounded-full ${
                    skill.expertise ? "bg-gold-500" : "bg-garnet-500"
                  }`}
                  aria-hidden="true"
                />
                <span className="font-medium text-parchment-900">{skillLabel(skill.name)}</span>
                {skill.expertise && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">
                    Exp
                  </span>
                )}
                <span className="ml-auto text-xs text-parchment-600">
                  {abilityAbbr(skill.ability)}
                </span>
                <span className="w-8 text-right tabular-nums font-semibold text-parchment-900">
                  {formatModifier(bonus)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {showAll && (
        <Modal title="All Skills" onClose={() => setShowAll(false)}>
          <SkillsTable
            skills={skills}
            abilityScores={abilityScores}
            proficiencyBonus={proficiencyBonus}
          />
        </Modal>
      )}
    </Card>
  );
}
