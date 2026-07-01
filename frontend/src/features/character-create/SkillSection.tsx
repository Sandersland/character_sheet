import Card from "@/components/ui/Card";
import { skillLabel } from "@/lib/abilities";
import type { SkillName } from "@/types/character";

interface SkillSectionProps {
  hasClass: boolean;
  grantedSkills: SkillName[];
  options: SkillName[];
  maxChoices: number;
  selected: SkillName[];
  onToggle: (skill: SkillName) => void;
}

export default function SkillSection({
  hasClass,
  grantedSkills,
  options,
  maxChoices,
  selected,
  onToggle,
}: SkillSectionProps) {
  return (
    <Card title="Skill Proficiencies" headingLevel={2}>
      <div className="flex flex-col gap-3 p-4">
        {!hasClass ? (
          <p className="text-sm text-parchment-600">
            Pick a class above to choose its skill proficiencies.
          </p>
        ) : (
          <>
            {grantedSkills.length > 0 && (
              <p className="text-xs text-parchment-600">
                Granted by background: {grantedSkills.map((s) => skillLabel(s)).join(", ")}
              </p>
            )}
            <p className="text-xs font-semibold text-parchment-600">
              Choose {maxChoices} ({selected.length}/{maxChoices} selected)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((skill) => (
                <label
                  key={skill}
                  className="flex items-center gap-2 text-sm text-parchment-800"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(skill)}
                    onChange={() => onToggle(skill)}
                    disabled={!selected.includes(skill) && selected.length >= maxChoices}
                  />
                  {skillLabel(skill)}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
