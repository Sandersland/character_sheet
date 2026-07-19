import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import OverviewPanel from "@/features/character-meta/panels/OverviewPanel";
import { RollProvider } from "@/features/dice/RollContext";
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
    speed: 30,
    initiativeBonus: 1,
    abilityScores: { strength: 10, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
    skills: [{ name: "arcana", ability: "intelligence", proficient: true }],
    savingThrowProficiencies: [],
    toolProficiencies: ["smiths-tools"],
    armorProficiencies: ["light"],
    inventory: [],
    advancements: [{ id: "a1", type: "asi", level: 4, label: "STR +2" }],
    advancementSlots: { total: 1, used: 1 },
    rollModifiers: [],
    ...overrides,
  } as unknown as Character;
}

function renderPanel(character: Character) {
  const props: SheetPanelProps = { character, reference: null, onUpdate: vi.fn() };
  return render(
    <RollProvider>
      <OverviewPanel {...props} />
    </RollProvider>,
  );
}

describe("OverviewPanel", () => {
  it("renders the two-column layout for a caster, including the Spell Slots card, and no Equipped card", () => {
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
    // Left column: Skills + Proficiencies.
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("proficiencies")).toBeInTheDocument();
    // Right column: XP, Spell Slots (caster), Class Features, Advancements.
    expect(screen.getByText("xp")).toBeInTheDocument();
    expect(screen.getByText("Spell Slots")).toBeInTheDocument();
    expect(screen.getByText("features")).toBeInTheDocument();
    expect(screen.getByText("advancements")).toBeInTheDocument();
    // Equipped gear now lives on the Inventory tab (#1086).
    expect(screen.queryByText("Equipped")).toBeNull();
  });

  it("omits the Spell Slots card for a non-caster", () => {
    renderPanel(makeCharacter({ spellcasting: undefined }));
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.queryByText("Spell Slots")).not.toBeInTheDocument();
    expect(screen.queryByText("Equipped")).toBeNull();
  });

  it("keeps the #advancement-card anchor so HP notices can deep-link to it", () => {
    const { container } = renderPanel(makeCharacter({ spellcasting: undefined }));
    expect(container.querySelector("#advancement-card")).not.toBeNull();
  });

  it("shows the mobile quick-bar labels and no 'vitals' copy", () => {
    renderPanel(makeCharacter({ spellcasting: undefined }));
    expect(screen.getByText("Prof Bonus")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Initiative")).toBeInTheDocument();
    expect(screen.queryByText(/vitals/i)).toBeNull();
  });
});
