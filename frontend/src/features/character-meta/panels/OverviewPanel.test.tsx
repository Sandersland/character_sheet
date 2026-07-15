import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import OverviewPanel from "@/features/character-meta/panels/OverviewPanel";
import type { Character } from "@/types/character";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

// Stub the heavy domain sections so the smoke test targets only the layout.
vi.mock("@/features/abilities/AbilityScoresPanel", () => ({ default: () => <div>abilities</div> }));
vi.mock("@/features/experience/ExperienceTracker", () => ({ default: () => <div>xp</div> }));
vi.mock("@/features/class/ClassFeaturesSection", () => ({ default: () => <div>features</div> }));
vi.mock("@/features/advancement/AdvancementSection", () => ({ default: () => <div>advancements</div> }));
vi.mock("@/features/abilities/ProficienciesCard", () => ({ default: () => <div>proficiencies</div> }));

function makeCharacter(overrides: Partial<Character>): Character {
  return {
    id: "c1",
    name: "Mage",
    class: "Wizard",
    proficiencyBonus: 2,
    abilityScores: { strength: 10, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
    skills: [{ name: "arcana", ability: "intelligence", proficient: true }],
    savingThrowProficiencies: [],
    toolProficiencies: [],
    inventory: [],
    advancements: [],
    advancementSlots: { total: 0, used: 0 },
    ...overrides,
  } as Character;
}

function renderPanel(character: Character) {
  const props: SheetPanelProps = { character, reference: null, onUpdate: vi.fn() };
  return render(<OverviewPanel {...props} />);
}

describe("OverviewPanel", () => {
  it("renders the curated columns for a caster, including the Spell Slots card", () => {
    renderPanel(
      makeCharacter({
        spellcasting: {
          ability: "intelligence",
          spellSaveDC: 13,
          spellAttackBonus: 5,
          slots: [{ level: 1, total: 2, used: 0 }],
        },
      } as Partial<Character>)
    );
    expect(screen.getByText("Proficient Skills")).toBeInTheDocument();
    expect(screen.getByText("Spell Slots")).toBeInTheDocument();
    expect(screen.getByText("Equipped")).toBeInTheDocument();
  });

  it("omits the Spell Slots card for a non-caster", () => {
    renderPanel(makeCharacter({ spellcasting: undefined }));
    expect(screen.getByText("Proficient Skills")).toBeInTheDocument();
    expect(screen.queryByText("Spell Slots")).not.toBeInTheDocument();
  });
});
