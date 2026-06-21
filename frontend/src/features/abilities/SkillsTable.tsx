import { abilityAbbr, abilityModifier, formatModifier, skillBonus, skillLabel } from "@/lib/abilities";
import RollButton from "@/features/dice/RollButton";
import type { AbilityScores, Skill } from "@/types/character";

interface SkillsTableProps {
  skills: Skill[];
  abilityScores: AbilityScores;
  proficiencyBonus: number;
}

/**
 * Skills as a condensed table (components.md: "Condensed trades comfort
 * for density — power-user/admin tables", which a full 18-row skill list
 * is). Bonus column is right-aligned per principles.md's numeric-column
 * rule; proficiency is a small filled dot rather than a checkbox column,
 * keeping it a non-color-only signal alongside row emphasis.
 */
export default function SkillsTable({
  skills,
  abilityScores,
  proficiencyBonus,
}: SkillsTableProps) {
  const sorted = [...skills].sort((a, b) =>
    skillLabel(a.name).localeCompare(skillLabel(b.name))
  );

  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <caption className="sr-only">Skills and their modifiers</caption>
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-parchment-500">
          <th scope="col" className="w-6 py-1.5 pl-4">
            <span className="sr-only">Proficient</span>
          </th>
          <th scope="col" className="w-[44%] py-1.5 font-semibold">
            Skill
          </th>
          <th scope="col" className="w-[28%] py-1.5 font-semibold">
            Ability
          </th>
          <th scope="col" className="w-[16%] py-1.5 pr-4 text-right font-semibold">
            Bonus
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((skill) => {
          const score = abilityScores[skill.ability];
          const bonus = skillBonus(
            score,
            proficiencyBonus,
            skill.proficient,
            skill.expertise
          );
          const isEmphasized = skill.proficient || skill.expertise;

          return (
            <tr
              key={skill.name}
              className="border-t border-parchment-200"
            >
              <td className="py-1.5 pl-4">
                <span
                  className={`block h-2 w-2 rounded-full ${
                    skill.expertise
                      ? "bg-gold-500"
                      : skill.proficient
                        ? "bg-garnet-500"
                        : "bg-parchment-200"
                  }`}
                  aria-hidden="true"
                />
              </td>
              <td
                className={`py-1.5 ${
                  isEmphasized
                    ? "font-medium text-parchment-900"
                    : "text-parchment-600"
                }`}
              >
                {skillLabel(skill.name)}
                {skill.expertise && (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold-700">
                    Expertise
                  </span>
                )}
              </td>
              <td className="py-1.5 text-xs text-parchment-400">
                {abilityAbbr(skill.ability)}{" "}
                <span className="tabular-nums">
                  ({formatModifier(abilityModifier(score))})
                </span>
              </td>
              <td className="py-1.5 pr-4 text-right tabular-nums font-semibold text-parchment-900">
                <RollButton
                  spec={{ count: 1, faces: 20, modifier: bonus }}
                  label={`${skillLabel(skill.name)} check`}
                  className="-m-0.5 inline-flex p-0.5"
                >
                  {formatModifier(bonus)}
                </RollButton>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
