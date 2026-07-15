import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ProficientSkillsCard from "@/features/abilities/ProficientSkillsCard";
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

function renderCard(skills: Skill[]) {
  return render(
    <RollProvider>
      <ProficientSkillsCard skills={skills} abilityScores={scores} proficiencyBonus={2} />
    </RollProvider>
  );
}

describe("ProficientSkillsCard", () => {
  const skills: Skill[] = [
    { name: "stealth", ability: "dexterity", proficient: true },
    { name: "arcana", ability: "intelligence", proficient: false },
    { name: "athletics", ability: "strength", proficient: false, expertise: true },
    { name: "animalHandling", ability: "wisdom", proficient: false },
  ];

  it("lists only proficient or expertise skills", () => {
    renderCard(skills);
    expect(screen.getByText("Stealth")).toBeInTheDocument();
    expect(screen.getByText("Athletics")).toBeInTheDocument();
    expect(screen.queryByText("Arcana")).not.toBeInTheDocument();
    expect(screen.queryByText("Animal Handling")).not.toBeInTheDocument();
  });

  it("shows the Exp tag only on expertise skills, never a raw key", () => {
    renderCard(skills);
    const expTags = screen.getAllByText("Exp");
    expect(expTags).toHaveLength(1);
    expect(screen.queryByText("animalHandling")).not.toBeInTheDocument();
    expect(screen.queryByText("sleightOfHand")).not.toBeInTheDocument();
  });

  it("renders an empty state when there are no proficiencies", () => {
    renderCard([
      { name: "arcana", ability: "intelligence", proficient: false },
      { name: "history", ability: "intelligence", proficient: false },
    ]);
    expect(screen.getByText("No skill proficiencies.")).toBeInTheDocument();
  });

  it("opens the full skill table in a modal via 'All 18 →'", async () => {
    const user = userEvent.setup();
    // 18 real skills so the button reads "All 18".
    const full: Skill[] = [
      "acrobatics", "animalHandling", "arcana", "athletics", "deception", "history",
      "insight", "intimidation", "investigation", "medicine", "nature", "perception",
      "performance", "persuasion", "religion", "sleightOfHand", "stealth", "survival",
    ].map((name) => ({ name, ability: "dexterity", proficient: name === "stealth" } as Skill));

    renderCard(full);
    await user.click(screen.getByText("All 18 →"));

    const dialog = screen.getByRole("dialog");
    // The full table shows a skill that isn't proficient (only in the modal).
    expect(within(dialog).getByText("Arcana")).toBeInTheDocument();
    expect(within(dialog).getByText("Survival")).toBeInTheDocument();
  });
});
