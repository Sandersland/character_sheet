// #1689: the species-granted skill choice (Half-Elf's Skill Versatility) —
// driven purely by the served spec (CreationSpeciesSkillChoice.applicable);
// renders nothing when the server serves no chooseSkills for the chosen
// species+variant (every 2024 species, a fixed-only 2014 one). Mirrors
// SkillSection's own checkbox-grid shape, sibling section on the same step.
import Card from "@/components/ui/Card";
import { skillLabel } from "@/lib/abilities";
import type { CreationSpeciesSkillChoice } from "@/lib/characterCreation";
import type { SkillName } from "@/types/character";

interface SpeciesSkillSectionProps {
  choice: CreationSpeciesSkillChoice;
  onToggle: (skill: SkillName) => void;
}

export default function SpeciesSkillSection({ choice, onToggle }: SpeciesSkillSectionProps) {
  if (!choice.applicable) return null;
  return (
    <Card title="Species Skills" headingLevel={2}>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs font-semibold text-parchment-600">
          Choose {choice.count} ({choice.selected.length}/{choice.count} selected)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {choice.options.map((skill) => (
            <label key={skill.key} className="flex items-center gap-2 text-sm text-parchment-800">
              <input
                type="checkbox"
                checked={choice.selected.includes(skill.key)}
                onChange={() => onToggle(skill.key)}
                disabled={!choice.selected.includes(skill.key) && choice.selected.length >= choice.count}
              />
              {skillLabel(skill.key)}
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}
