import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import VitalsStrip from "@/features/character-meta/VitalsStrip";
import { RollProvider } from "@/features/dice/RollContext";
import type { Character } from "@/types/character";

function renderWithRoll(ui: React.ReactElement) {
  return render(<RollProvider>{ui}</RollProvider>);
}

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
  armorClassBreakdown: [
    { label: "Leather", value: 11 },
    { label: "Dex", value: 3 },
  ],
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
  armorProficiencies: [],
  weaponProficiencies: [],
  inventory: [],
  currency: { cp: 0, sp: 0, gp: 25, pp: 0 },
  conditions: { active: [], exhaustion: 0 },
  unarmedStrike: {
    attackBonus: 3,
    damage: { count: 1, faces: 1, modifier: 1, damageType: "bludgeoning" },
  },
  improvisedWeapon: {
    attackBonus: 1,
    proficient: false,
    damage: { count: 1, faces: 4, modifier: 1, damageType: "bludgeoning" },
  },
  advancements: [],
  advancementSlots: { total: 1, used: 0 },
  journal: [],
};

describe("VitalsStrip", () => {
  it("renders armor class", () => {
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("has no manual AC input — the tile is a disclosure button", () => {
    const { container } = renderWithRoll(<VitalsStrip character={mockCharacter} />);
    expect(container.querySelector("input")).toBeNull();
    expect(screen.getByRole("button", { name: "Armor Class breakdown" })).toBeInTheDocument();
  });

  it("clicking the AC tile opens the breakdown with labels, values, and total", async () => {
    const user = userEvent.setup();
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    const dialog = screen.getByRole("dialog", { name: "Armor Class breakdown" });
    expect(dialog).toHaveTextContent("Leather");
    expect(dialog).toHaveTextContent("11"); // base part: plain number
    expect(dialog).toHaveTextContent("Dex");
    expect(dialog).toHaveTextContent("+3"); // later parts: formatted modifier
    expect(dialog).toHaveTextContent("Total");
    expect(dialog).toHaveTextContent("14");
  });

  it("Escape closes the breakdown popover", async () => {
    const user = userEvent.setup();
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders initiative as a formatted modifier", () => {
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    // initiativeBonus=3 → formatModifier(3) = "+3"
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("renders speed with ft suffix", () => {
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    expect(screen.getByText("35 ft")).toBeInTheDocument();
  });

  it("renders proficiency bonus as a formatted modifier", () => {
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    // proficiencyBonus=2 → "+2"
    // (initiativeBonus is also +3, but proficiency is +2 — both use formatModifier)
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("does not render an HP readout (HitPointTracker owns HP)", () => {
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    expect(screen.queryByText("Hit Points")).not.toBeInTheDocument();
  });

  it("does not render an HP MeterBar (no duplicate of HitPointTracker)", () => {
    renderWithRoll(<VitalsStrip character={mockCharacter} />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});
