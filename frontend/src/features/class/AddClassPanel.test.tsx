import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AddClassPanel from "@/features/class/AddClassPanel";
import type { Character, ClassOption } from "@/types/character";

function makeClass(over: Partial<ClassOption>): ClassOption {
  return {
    id: over.id ?? "c",
    name: over.name ?? "Wizard",
    hitDie: over.hitDie ?? "d6",
    multiclassPrerequisite: over.multiclassPrerequisite ?? null,
    ...over,
  } as unknown as ClassOption;
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    class: "Fighter",
    level: 5,
    classes: [{ id: "e1", name: "Fighter", level: 5 }],
    abilityScores: {
      strength: 15,
      dexterity: 10,
      constitution: 12,
      intelligence: 10,
      wisdom: 8,
      charisma: 10,
    },
    ...over,
  } as unknown as Character;
}

const referenceClasses = [
  makeClass({ id: "cls-fighter", name: "Fighter", hitDie: "d10" }),
  makeClass({
    id: "cls-wizard",
    name: "Wizard",
    hitDie: "d6",
    multiclassPrerequisite: { options: [{ intelligence: 13 }], description: "Intelligence 13" },
  }),
  makeClass({
    id: "cls-rogue",
    name: "Rogue",
    hitDie: "d8",
    multiclassPrerequisite: { options: [{ dexterity: 13 }], description: "Dexterity 13" },
  }),
];

describe("AddClassPanel", () => {
  it("collapsed: shows the add-a-class trigger", () => {
    render(
      <AddClassPanel
        character={makeCharacter()}
        referenceClasses={referenceClasses}
        busy={false}
        onAddClass={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /add a class/i })).toBeInTheDocument();
  });

  it("excludes classes the character already has", async () => {
    const user = userEvent.setup();
    render(
      <AddClassPanel
        character={makeCharacter()}
        referenceClasses={referenceClasses}
        busy={false}
        onAddClass={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add a class/i }));
    // Fighter is already owned — not offered.
    expect(screen.queryByRole("option", { name: /^Fighter/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Wizard/ })).toBeInTheDocument();
  });

  it("disables an ineligible class and surfaces its prerequisite", async () => {
    const user = userEvent.setup();
    render(
      <AddClassPanel
        character={makeCharacter()}
        referenceClasses={referenceClasses}
        busy={false}
        onAddClass={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add a class/i }));
    // Wisdom/Int/Dex all below 13 here except none — Wizard needs Int 13 (has 10).
    const wizardOption = screen.getByRole("option", { name: /Wizard/ }) as HTMLOptionElement;
    expect(wizardOption.disabled).toBe(true);
    expect(wizardOption.textContent).toMatch(/requires Intelligence 13/i);
  });

  it("adds an eligible class with the average HP method", async () => {
    const user = userEvent.setup();
    const onAddClass = vi.fn();
    // Dexterity 13 → Rogue is eligible.
    const character = makeCharacter({
      abilityScores: {
        strength: 15,
        dexterity: 13,
        constitution: 12,
        intelligence: 10,
        wisdom: 8,
        charisma: 10,
      },
    } as Partial<Character>);
    render(
      <AddClassPanel
        character={character}
        referenceClasses={referenceClasses}
        busy={false}
        onAddClass={onAddClass}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add a class/i }));
    await user.selectOptions(screen.getByRole("combobox"), "cls-rogue");
    await user.click(screen.getByRole("button", { name: /^Add class$/i }));
    expect(onAddClass).toHaveBeenCalledWith({
      type: "addClass",
      classId: "cls-rogue",
      method: "average",
      roll: undefined,
    });
  });
});
