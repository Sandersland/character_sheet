import Card from "@/components/ui/Card";
import RollButton from "@/features/dice/RollButton";
import {
  ABILITY_ORDER,
  abilityLabel,
  formatModifier,
  skillBonus,
  skillLabel,
} from "@/lib/abilities";
import type { AbilityName, AbilityScores, Skill } from "@/types/character";

interface AllSkillsCardProps {
  skills: Skill[];
  abilityScores: AbilityScores;
  proficiencyBonus: number;
  twoColumn?: boolean;
}

export default function AllSkillsCard({
  skills,
  abilityScores,
  proficiencyBonus,
  twoColumn = false,
}: AllSkillsCardProps) {
  const groups = ABILITY_ORDER.map((ability) => ({
    ability,
    skills: skills
      .filter((skill) => skill.ability === ability)
      .sort((a, b) => skillLabel(a.name).localeCompare(skillLabel(b.name))),
  })).filter((group) => group.skills.length > 0);

  return (
    <Card title="Skills">
      <div
        className={
          twoColumn
            ? "grid grid-cols-1 gap-x-6 pb-1 sm:grid-cols-2"
            : "flex flex-col divide-y divide-parchment-200"
        }
      >
        {groups.map((group) => (
          <section key={group.ability} className="py-1.5 first:pt-0.5 last:pb-0.5">
            <SkillGroupHeading ability={group.ability} />
            <ul>
              {group.skills.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  score={abilityScores[skill.ability]}
                  proficiencyBonus={proficiencyBonus}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

function SkillGroupHeading({ ability }: { ability: AbilityName }) {
  return (
    <h3 className="px-4 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-parchment-500">
      {abilityLabel(ability)}
    </h3>
  );
}

// Proficiency dot color is not the only signal — pair with a text cue elsewhere, never color alone.
function skillDotClass(skill: Skill): string {
  if (skill.expertise) return "bg-gold-500";
  if (skill.proficient) return "bg-garnet-500";
  return "bg-parchment-200";
}

// Source label is free text from the backend — safe to render as-is (#438).
function SkillBuffBadge({ skill }: { skill: Skill }) {
  if (!skill.tempModifier) return null;
  const source = skill.tempModifierSources?.map((s) => s.label).join(", ") ?? "";
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
      title={source}
    >
      {`${skill.tempModifier > 0 ? "+" : ""}${skill.tempModifier} ${source}`}
    </span>
  );
}

function SkillRow({
  skill,
  score,
  proficiencyBonus,
}: {
  skill: Skill;
  score: number;
  proficiencyBonus: number;
}) {
  const bonus = skillBonus(score, proficiencyBonus, skill.proficient, skill.expertise, skill.tempModifier ?? 0);
  const emphasized = skill.proficient || skill.expertise;
  const label = skillLabel(skill.name);

  return (
    <li>
      <RollButton
        spec={{ count: 1, faces: 20, modifier: bonus }}
        label={`${label} check`}
        log={{ kind: "check", source: `${label} check`, ability: skill.ability, skill: skill.name }}
        className="w-full px-4 py-1"
      >
        <span className="flex items-center gap-2 text-sm">
          <span className={`block h-2 w-2 shrink-0 rounded-full ${skillDotClass(skill)}`} aria-hidden="true" />
          <span className={emphasized ? "font-medium text-parchment-900" : "text-parchment-600"}>{label}</span>
          {skill.expertise && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">Expertise</span>
          )}
          <SkillBuffBadge skill={skill} />
          <span className="ml-auto tabular-nums font-semibold text-parchment-900">{formatModifier(bonus)}</span>
        </span>
      </RollButton>
    </li>
  );
}
