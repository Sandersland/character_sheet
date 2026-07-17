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

  it("renders an always-on HP readout (current / max)", () => {
    renderWithRoll(<BannerVitals character={mockCharacter} />);
    expect(screen.getByText("Hit Points")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.getByText("/36")).toBeInTheDocument();
  });

  it("shows temp HP when present", () => {
    renderWithRoll(
      <BannerVitals
        character={{ ...mockCharacter, hitPoints: { ...mockCharacter.hitPoints, temp: 5 } }}
      />,
    );
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  // #982: the live-Combat panel no longer carries a CompactHpBar, so the header
  // HP readout must be the entry point to the HP sheet.
  it("with onUpdate, the HP chip is a 'Manage hit points' button that opens the HP sheet", async () => {
    const user = userEvent.setup();
    renderWithRoll(<BannerVitals character={mockCharacter} onUpdate={() => {}} />);
    const hpButton = screen.getByRole("button", { name: /manage hit points/i });
    expect(hpButton).toBeInTheDocument();
    await user.click(hpButton);
    expect(
      screen.getByRole("heading", { name: /hit points/i }),
    ).toBeInTheDocument();
  });

  it("without onUpdate, the HP readout stays read-only (no manage-HP button)", () => {
    renderWithRoll(<BannerVitals character={mockCharacter} />);
    expect(screen.queryByRole("button", { name: /manage hit points/i })).not.toBeInTheDocument();
  });
});
