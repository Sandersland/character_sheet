import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PreparedSpellList from "@/features/spells/PreparedSpellList";
import type { Character, Spell } from "@/types/character";

type Spellcasting = NonNullable<Character["spellcasting"]>;

function spell(partial: Partial<Spell>): Spell {
  return {
    id: partial.name ?? "x",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "",
    ...partial,
  } as Spell;
}

function sc(spells: Spell[]): Spellcasting {
  return { ability: "intelligence", spellSaveDC: 15, spellAttackBonus: 7, spells } as Spellcasting;
}

describe("PreparedSpellList", () => {
  it("renders cantrip and prepared groups with their spells", () => {
    render(
      <PreparedSpellList
        spellcasting={sc([
          spell({ name: "Fire Bolt", level: 0 }),
          spell({ name: "Fireball", level: 3, prepared: true }),
        ])}
        busy={false}
        onCast={vi.fn()}
      />,
    );
    expect(screen.getByText("Cantrips · at will")).toBeInTheDocument();
    expect(screen.getByText("Prepared · leveled")).toBeInTheDocument();
    expect(screen.getByText("Fire Bolt")).toBeInTheDocument();
    expect(screen.getByText("Fireball")).toBeInTheDocument();
  });

  it("casts the spell via the Cast affordance", async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    render(
      <PreparedSpellList
        spellcasting={sc([spell({ name: "Fireball", level: 3, prepared: true })])}
        busy={false}
        onCast={onCast}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cast Fireball" }));
    expect(onCast).toHaveBeenCalledWith(expect.objectContaining({ name: "Fireball" }));
  });

  it("renders nothing when there are no castable spells", () => {
    const { container } = render(
      <PreparedSpellList spellcasting={sc([])} busy={false} onCast={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
