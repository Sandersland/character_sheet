import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import AllSkillsCard from "@/features/abilities/AllSkillsCard";
import { RollProvider } from "@/features/dice/RollContext";
import type { AbilityScores, Skill } from "@/types/character";

const scores: AbilityScores = {
  strength: 14,
  dexterity: 16,
  constitution: 10,
  intelligence: 10,
  wisdom: 12,
  charisma: 10,
};

const SKILL_ABILITY: Record<string, Skill["ability"]> = {
  acrobatics: "dexterity", animalHandling: "wisdom", arcana: "intelligence",
  athletics: "strength", deception: "charisma", history: "intelligence",
  insight: "wisdom", intimidation: "charisma", investigation: "intelligence",
  medicine: "wisdom", nature: "intelligence", perception: "wisdom",
  performance: "charisma", persuasion: "charisma", religion: "intelligence",
  sleightOfHand: "dexterity", stealth: "dexterity", survival: "wisdom",
};

function allEighteen(overrides: Partial<Record<string, Partial<Skill>>> = {}): Skill[] {
  return Object.keys(SKILL_ABILITY).map(
    (name) =>
      ({
        name,
        ability: SKILL_ABILITY[name],
        proficient: false,
        ...overrides[name],
      }) as Skill,
  );
}

function renderCard(skills: Skill[]) {
  return render(
    <RollProvider>
      <AllSkillsCard skills={skills} abilityScores={scores} proficiencyBonus={2} />
    </RollProvider>,
  );
}

describe("AllSkillsCard", () => {
  it("renders all 18 skills as roll rows — including non-proficient ones — with no modal", () => {
    renderCard(allEighteen({ stealth: { proficient: true } }));

    // A proficient skill AND a non-proficient one are both present inline.
    expect(screen.getByText("Stealth")).toBeInTheDocument();
    expect(screen.getByText("Arcana")).toBeInTheDocument();
    expect(screen.getByText("Survival")).toBeInTheDocument();

    // Every skill is a one-tap roll button; 18 of them.
    const rollButtons = screen.getAllByTitle(/^Roll .+ check:/);
    expect(rollButtons).toHaveLength(18);

    // The retired modal path is gone.
    expect(screen.queryByText(/All 18/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("groups skills under their governing ability heading", () => {
    renderCard(allEighteen());
    // Canonical ability headings present.
    for (const ability of ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]) {
      // Constitution has no skills, so it must NOT appear; the rest do.
      if (ability === "Constitution") {
        expect(screen.queryByRole("heading", { name: ability })).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole("heading", { name: ability })).toBeInTheDocument();
      }
    }
  });

  it("marks expertise with a tag and never renders a raw skill key", () => {
    renderCard(allEighteen({ sleightOfHand: { proficient: true, expertise: true } }));
    expect(screen.getByText("Sleight of Hand")).toBeInTheDocument();
    expect(screen.getAllByText(/expertise/i)).toHaveLength(1);
    expect(screen.queryByText("sleightOfHand")).not.toBeInTheDocument();
    expect(screen.queryByText("animalHandling")).not.toBeInTheDocument();
  });

  it("rolls a skill check with the correct bonus (ability mod + proficiency)", () => {
    renderCard(allEighteen({ stealth: { proficient: true } }));
    // Stealth = Dex mod (+3) + proficiency (+2) = +5.
    expect(screen.getByTitle("Roll Stealth check: 1d20 + 5")).toBeInTheDocument();
    // Non-proficient Acrobatics = Dex mod (+3) only.
    expect(screen.getByTitle("Roll Acrobatics check: 1d20 + 3")).toBeInTheDocument();
  });
});
