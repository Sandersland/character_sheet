import { skillLabel } from "@/lib/abilities";
import type { Skill } from "@/types/character";

// The proficient/expertise skills for the Overview summary, sorted by display label.
export function proficientSkills(skills: Skill[]): Skill[] {
  return skills
    .filter((skill) => skill.proficient || skill.expertise)
    .sort((a, b) => skillLabel(a.name).localeCompare(skillLabel(b.name)));
}
