import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import SkillsTable from "@/features/abilities/SkillsTable";
import { RollProvider } from "@/features/dice/RollContext";
import { skillBonus } from "@/lib/abilities";
import type { AbilityScores, Skill } from "@/types/character";

const scores: AbilityScores = {
  strength: 14,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

describe("skillBonus with tempModifier", () => {
  it("adds the active buff modifier on top of the ability + proficiency terms", () => {
    // STR 14 → +2, proficient (+2), buff (+4) = +8.
    expect(skillBonus(14, 2, true, false, 4)).toBe(8);
    // Non-proficient with a buff still applies the buff.
    expect(skillBonus(14, 2, false, false, 4)).toBe(6);
  });
});

describe("SkillsTable buff display", () => {
  it("shows the buffed total and a labeled source indicator", () => {
    const skills: Skill[] = [
      {
        name: "athletics",
        ability: "strength",
        proficient: false,
        tempModifier: 4,
        tempModifierSources: [{ label: "Enhance Ability", value: 4 }],
      },
    ];

    render(
      <RollProvider>
        <SkillsTable skills={skills} abilityScores={scores} proficiencyBonus={2} />
      </RollProvider>,
    );

    // STR mod +2 + buff +4 = +6.
    expect(screen.getByText("+6")).toBeInTheDocument();
    // Source indicator names the buff (skill label resolved via helper, not raw key).
    expect(screen.getByText("Athletics")).toBeInTheDocument();
    expect(screen.getByText(/\+4 Enhance Ability/)).toBeInTheDocument();
  });
});
