import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellPicker, { type SpellPickerGroup } from "@/features/spells/SpellPicker";
import { axe } from "@/test/axe";
import type { CatalogSpell } from "@/types/character";

function spell(over: Partial<CatalogSpell>): CatalogSpell {
  return {
    id: "c1",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft.",
    duration: "Instantaneous",
    description: "",
    concentration: false,
    ritual: false,
    classes: [],
    cantripScaling: false,
    ...over,
  };
}

const eldritchBlast = spell({ id: "eb", name: "Eldritch Blast", level: 0, school: "evocation" });
const minorIllusion = spell({ id: "mi", name: "Minor Illusion", level: 0, school: "illusion" });
const holdPerson = spell({
  id: "hp",
  name: "Hold Person",
  level: 2,
  school: "enchantment",
  concentration: true,
  description: "Choose a Humanoid you can see within range or be Paralyzed for the duration.",
  attackType: "save",
  saveAbility: "wisdom",
});
const charmPerson = spell({ id: "cp", name: "Charm Person", level: 1, school: "enchantment" });

function groups(over: {
  cantripSelected?: string[];
  cantripCap?: number;
  spellSelected?: string[];
  spellCap?: number;
  onCantrip?: (id: string) => void;
  onSpell?: (id: string) => void;
}): SpellPickerGroup[] {
  return [
    {
      key: "cantrips",
      label: "Cantrips",
      options: [eldritchBlast, minorIllusion],
      selectedIds: over.cantripSelected ?? [],
      cap: over.cantripCap ?? 2,
      onToggle: over.onCantrip ?? vi.fn(),
    },
    {
      key: "spells",
      label: "Spells",
      options: [holdPerson, charmPerson],
      selectedIds: over.spellSelected ?? [],
      cap: over.spellCap ?? 2,
      onToggle: over.onSpell ?? vi.fn(),
    },
  ];
}

describe("SpellPicker", () => {
  it("renders both group labels and the default budget headline", () => {
    render(<SpellPicker groups={groups({ cantripSelected: ["eb"] })} />);
    expect(screen.getByText("Cantrips")).toBeInTheDocument();
    expect(screen.getByText("Spells")).toBeInTheDocument();
    expect(screen.getByText("Cantrips 1/2 · Spells 0/2")).toBeInTheDocument();
  });

  it("lets an override headline win", () => {
    render(<SpellPicker groups={groups({})} headline="Learn your magic" />);
    expect(screen.getByText("Learn your magic")).toBeInTheDocument();
  });

  it("filters rows in both groups from one search box", async () => {
    render(<SpellPicker groups={groups({})} />);
    await userEvent.type(screen.getByRole("searchbox"), "person");
    expect(screen.getByRole("button", { name: "Open Hold Person" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Charm Person" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Eldritch Blast" })).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", async () => {
    render(<SpellPicker groups={groups({})} />);
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText(/No spells match/)).toBeInTheDocument();
  });

  it("toggles through the right group's onToggle with the spell id", async () => {
    const onCantrip = vi.fn();
    const onSpell = vi.fn();
    render(<SpellPicker groups={groups({ onCantrip, onSpell })} />);
    await userEvent.click(screen.getByRole("button", { name: "Add Eldritch Blast" }));
    expect(onCantrip).toHaveBeenCalledWith("eb");
    await userEvent.click(screen.getByRole("button", { name: "Add Hold Person" }));
    expect(onSpell).toHaveBeenCalledWith("hp");
  });

  it("marks a selected pill pressed and keeps it toggleable at cap", async () => {
    const onCantrip = vi.fn();
    render(<SpellPicker groups={groups({ cantripSelected: ["eb", "mi"], onCantrip })} />);
    const pressed = screen.getByRole("button", { name: "Add Eldritch Blast" });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    expect(pressed).toBeEnabled();
    await userEvent.click(pressed);
    expect(onCantrip).toHaveBeenCalledWith("eb");
  });

  it("disables an unselected pill once its group is at cap", () => {
    render(<SpellPicker groups={groups({ cantripSelected: ["eb", "mi"] })} />);
    // Both cantrip options are selected → both stay enabled; add a third eligible.
    render(
      <SpellPicker
        groups={[
          {
            key: "cantrips",
            label: "Cantrips",
            options: [eldritchBlast, minorIllusion, spell({ id: "x", name: "Ray of Frost", level: 0 })],
            selectedIds: ["eb", "mi"],
            cap: 2,
            onToggle: vi.fn(),
          },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Add Ray of Frost" })).toBeDisabled();
  });

  it("renders known spells as disabled Known rows", () => {
    render(<SpellPicker groups={groups({})} knownSpellIds={new Set(["mi"])} />);
    const known = screen.getByRole("button", { name: /Minor Illusion already known/ });
    expect(known).toBeDisabled();
    expect(within(known).getByText("Known")).toBeInTheDocument();
  });

  it("opens the detail card with the full description from a row body, and the CTA learns then closes", async () => {
    const onSpell = vi.fn();
    render(<SpellPicker groups={groups({ onSpell })} />);
    await userEvent.click(screen.getByRole("button", { name: "Open Hold Person" }));
    expect(screen.getByText(/or be Paralyzed for the duration/)).toBeInTheDocument();
    const learn = screen.getByRole("button", { name: /Learn Hold Person/ });
    await userEvent.click(learn);
    expect(onSpell).toHaveBeenCalledWith("hp");
    expect(screen.queryByText(/or be Paralyzed for the duration/)).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<SpellPicker groups={groups({ cantripSelected: ["eb"] })} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
