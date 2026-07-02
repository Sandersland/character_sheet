import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LevelUpModal from "@/features/hitpoints/LevelUpModal";
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
    hitDice: { total: 5, die: "d10", spent: 0 },
    abilityScores: {
      strength: 15,
      dexterity: 10,
      constitution: 12,
      intelligence: 15,
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
];

describe("LevelUpModal", () => {
  it("lists existing classes and a new-class option", () => {
    render(
      <LevelUpModal
        character={makeCharacter()}
        referenceClasses={referenceClasses}
        conMod={1}
        pending={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: /Fighter 5 → 6/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /New class \(multiclass\)/ })).toBeInTheDocument();
  });

  it("advances the primary class by default (existing target)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <LevelUpModal
        character={makeCharacter()}
        referenceClasses={referenceClasses}
        conMod={1}
        pending={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Take average/ }));
    expect(onConfirm).toHaveBeenCalledWith("average", { kind: "existing", classEntryId: "e1" });
  });

  it("multiclasses into a chosen new class (new target)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <LevelUpModal
        character={makeCharacter()}
        referenceClasses={referenceClasses}
        conMod={1}
        pending={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /New class \(multiclass\)/ }));
    await user.selectOptions(screen.getByRole("combobox"), "cls-wizard");
    await user.click(screen.getByRole("button", { name: /Roll d6/ }));
    expect(onConfirm).toHaveBeenCalledWith("roll", { kind: "new", classId: "cls-wizard" });
  });

  it("blocks confirming a new class whose prerequisite is unmet", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    // Intelligence 10 → Wizard ineligible.
    const character = makeCharacter({
      abilityScores: {
        strength: 15,
        dexterity: 10,
        constitution: 12,
        intelligence: 10,
        wisdom: 8,
        charisma: 10,
      },
    } as Partial<Character>);
    render(
      <LevelUpModal
        character={character}
        referenceClasses={referenceClasses}
        conMod={1}
        pending={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /New class \(multiclass\)/ }));
    // Wizard option is disabled; nothing selectable → confirm stays disabled.
    const wizardOption = screen.getByRole("option", { name: /Wizard/ }) as HTMLOptionElement;
    expect(wizardOption.disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Take average/ })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
