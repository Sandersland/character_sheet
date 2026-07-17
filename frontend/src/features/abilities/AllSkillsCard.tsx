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
}

/**
 * All 18 skills, inline and always open on the Overview, grouped by governing
 * ability (D1: flat, no accordion). Every skill — proficient or not — is a
 * one-tap `RollButton` (kind `check`), so the roll fires with no dialog open
 * and its result reaches the result surface un-suppressed (#957). Replaces the
 * proficient-only card + full-screen "All Skills" modal.
 *
 * Proficiency is a non-color-only signal: a filled dot (gold expertise / garnet
 * proficient / faint neutral) plus an "Expertise" tag and row emphasis.
 */
export default function AllSkillsCard({ skills, abilityScores, proficiencyBonus }: AllSkillsCardProps) {
  const groups = ABILITY_ORDER.map((ability) => ({
    ability,
    skills: skills
      .filter((skill) => skill.ability === ability)
      .sort((a, b) => skillLabel(a.name).localeCompare(skillLabel(b.name))),
  })).filter((group) => group.skills.length > 0);

  return (
    <Card title="Skills">
      <div className="flex flex-col divide-y divide-parchment-200">
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

// Non-color-only proficiency signal: gold expertise / garnet proficient / faint.
function skillDotClass(skill: Skill): string {
  if (skill.expertise) return "bg-gold-500";
  if (skill.proficient) return "bg-garnet-500";
  return "bg-parchment-200";
}

// Active cast-granted buff badge (#438): free-text source label, safe to render.
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
