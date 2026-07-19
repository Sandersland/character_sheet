import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BannerVitals from "@/features/character-meta/BannerVitals";
import { RollProvider } from "@/features/dice/RollContext";
import type { Character } from "@/types/character";

function renderWithRoll(ui: React.ReactElement) {
  return render(<RollProvider>{ui}</RollProvider>);
}

const mockCharacter: Character = {
  id: "char-1",
  ownerId: "user-1",
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
  sneakAttack: null,
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
  activeEffects: { buffs: [] },
  rollModifiers: [],
  unarmedStrike: {
    attackBonus: 3,
    damage: { count: 1, faces: 1, modifier: 1, damageType: "bludgeoning" },
  },
  improvisedWeapon: {
    attackBonus: 1,
    proficient: false,
    damage: { count: 1, faces: 4, modifier: 1, damageType: "bludgeoning" },
  },
  attacksPerAction: 1,
  advancements: [],
  advancementSlots: { total: 1, used: 0 },
  journal: [],
};

describe("BannerVitals", () => {
  it("renders armor class as a disclosure button (no manual input)", () => {
    const { container } = renderWithRoll(<BannerVitals character={mockCharacter} />);
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.getByRole("button", { name: "Armor Class breakdown" })).toBeInTheDocument();
  });

  it("clicking the AC tile opens the breakdown with labels, values, and total", async () => {
    const user = userEvent.setup();
    renderWithRoll(<BannerVitals character={mockCharacter} />);
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
    renderWithRoll(<BannerVitals character={mockCharacter} />);
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders speed with ft suffix and proficiency as a formatted modifier", () => {
    renderWithRoll(<BannerVitals character={mockCharacter} />);
    expect(screen.getByText("35 ft")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument(); // proficiencyBonus=2
  });

  // #1085: HP left the header entirely (it lives in the Combat tab). The banner
  // is four self-labeled stat cards, no HP readout and no manage-HP entry point.
  it("renders no HP readout or manage-HP control in the header", () => {
    renderWithRoll(<BannerVitals character={mockCharacter} />);
    expect(screen.queryByText(/hit points/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manage hit points/i })).not.toBeInTheDocument();
  });

  it("renders exactly four self-labeled stat cards: AC / Initiative / Speed / Proficiency", () => {
    renderWithRoll(<BannerVitals character={mockCharacter} />);
    expect(screen.getByText("Armor Class")).toBeInTheDocument();
    expect(screen.getByText("Initiative")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Proficiency")).toBeInTheDocument();
  });
});
