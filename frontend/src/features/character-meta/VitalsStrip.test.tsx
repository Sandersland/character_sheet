import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import VitalsStrip from "@/features/character-meta/VitalsStrip";
import type { Character } from "@/types/character";

const mockCharacter: Character = {
  id: "char-1",
  name: "Aria Swiftwind",
  race: "Elf",
  class: "Ranger",
  level: 4,
  experiencePoints: 2700,
  currentLevelThreshold: 2700,
  nextLevelThreshold: 6500,
  pendingLevelUps: 0,
  background: "Outlander",
  alignment: "Neutral Good",
  armorClass: 14,
  initiativeBonus: 3,
  speed: 35,
  proficiencyBonus: 2,
  hitPoints: { current: 28, max: 36, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 4, die: "d10", spent: 0 },
  abilityScores: {
    strength: 12,
    dexterity: 16,
    constitution: 14,
    intelligence: 10,
    wisdom: 14,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  inventory: [],
  currency: { cp: 0, sp: 0, gp: 25, pp: 0 },
  journal: [],
};

describe("VitalsStrip", () => {
  it("renders armor class", () => {
    render(<VitalsStrip character={mockCharacter} />);
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("renders initiative as a formatted modifier", () => {
    render(<VitalsStrip character={mockCharacter} />);
    // initiativeBonus=3 → formatModifier(3) = "+3"
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("renders speed with ft suffix", () => {
    render(<VitalsStrip character={mockCharacter} />);
    expect(screen.getByText("35 ft")).toBeInTheDocument();
  });

  it("renders proficiency bonus as a formatted modifier", () => {
    render(<VitalsStrip character={mockCharacter} />);
    // proficiencyBonus=2 → "+2"
    // (initiativeBonus is also +3, but proficiency is +2 — both use formatModifier)
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders current and max HP", () => {
    render(<VitalsStrip character={mockCharacter} />);
    expect(screen.getByText(/28/)).toBeInTheDocument();
    expect(screen.getByText(/36/)).toBeInTheDocument();
  });

  it("renders an HP MeterBar", () => {
    render(<VitalsStrip character={mockCharacter} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "28");
    expect(meter).toHaveAttribute("aria-valuemax", "36");
  });
});
