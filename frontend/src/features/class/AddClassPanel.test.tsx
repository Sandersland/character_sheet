import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import AddClassPanel from "@/features/class/AddClassPanel";
import type { Character, ClassOption } from "@/types/character";

// #1131: picking a class routes into the shared level-up ceremony, so the panel
// navigates rather than committing an addClass op inline.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

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
    pendingLevelUps: 1,
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

function renderPanel(character: Character) {
  return render(
    <MemoryRouter>
      <AddClassPanel character={character} referenceClasses={referenceClasses} busy={false} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockClear();
});

describe("AddClassPanel", () => {
  it("gates behind a pending level-up (no trigger, shows a hint) when none is available", () => {
    renderPanel(makeCharacter({ pendingLevelUps: 0 } as Partial<Character>));
    expect(screen.queryByRole("button", { name: /add a class/i })).not.toBeInTheDocument();
    expect(screen.getByText(/level up to add a class/i)).toBeInTheDocument();
  });

  it("collapsed: shows the add-a-class trigger", () => {
    renderPanel(makeCharacter());
    expect(screen.getByRole("button", { name: /add a class/i })).toBeInTheDocument();
  });

  it("excludes classes the character already has", async () => {
    const user = userEvent.setup();
    renderPanel(makeCharacter());
    await user.click(screen.getByRole("button", { name: /add a class/i }));
    expect(screen.queryByRole("option", { name: /^Fighter/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Wizard/ })).toBeInTheDocument();
  });

  it("disables an ineligible class and surfaces its prerequisite", async () => {
    const user = userEvent.setup();
    renderPanel(makeCharacter());
    await user.click(screen.getByRole("button", { name: /add a class/i }));
    const wizardOption = screen.getByRole("option", { name: /Wizard/ }) as HTMLOptionElement;
    expect(wizardOption.disabled).toBe(true);
    expect(wizardOption.textContent).toMatch(/requires Intelligence 13/i);
  });

  it("navigates into the level-up ceremony with ?classId= for an eligible class (#1131)", async () => {
    const user = userEvent.setup();
    // Dexterity 13 → Rogue is eligible.
    const character = makeCharacter({
      abilityScores: { strength: 15, dexterity: 13, constitution: 12, intelligence: 10, wisdom: 8, charisma: 10 },
    } as Partial<Character>);
    renderPanel(character);
    await user.click(screen.getByRole("button", { name: /add a class/i }));
    await user.selectOptions(screen.getByRole("combobox"), "cls-rogue");
    await user.click(screen.getByRole("button", { name: /^Add class$/i }));
    expect(navigateMock).toHaveBeenCalledWith("/characters/char-1/level-up?classId=cls-rogue");
  });
});
