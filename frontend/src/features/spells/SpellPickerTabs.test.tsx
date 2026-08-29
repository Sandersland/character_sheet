import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellPickerTabs from "@/features/spells/SpellPickerTabs";
import type { SpellPickerGroup } from "@/features/spells/SpellPicker";
import type { CatalogSpell } from "@/types/character";

function spell(over: Partial<CatalogSpell>): CatalogSpell {
  return {
    id: "c1",
    name: "Spell",
    level: 0,
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

const fireBolt = spell({ id: "fb", name: "Fire Bolt" });
const eldritchBlast = spell({ id: "eb", name: "Eldritch Blast" });
const charmPerson = spell({ id: "cp", name: "Charm Person", level: 1 });

function group(over: Partial<SpellPickerGroup>): SpellPickerGroup {
  return {
    key: "g",
    label: "Group",
    options: [fireBolt],
    selectedIds: [],
    cap: 1,
    onToggle: vi.fn(),
    ...over,
  };
}

describe("SpellPickerTabs", () => {
  it("renders one segment per group", () => {
    render(
      <SpellPickerTabs
        groups={[
          group({ key: "species", label: "Species", options: [fireBolt] }),
          group({ key: "cantrips", label: "Cantrips", options: [eldritchBlast] }),
          group({ key: "spells", label: "Spells", options: [charmPerson] }),
        ]}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("shows only the first group's rows until a segment is clicked, then swaps", async () => {
    render(
      <SpellPickerTabs
        groups={[
          group({ key: "species", label: "Species", options: [fireBolt] }),
          group({ key: "cantrips", label: "Cantrips", options: [eldritchBlast] }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Open Fire Bolt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Eldritch Blast" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Cantrips/ }));

    expect(screen.queryByRole("button", { name: "Open Fire Bolt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Eldritch Blast" })).toBeInTheDocument();
  });

  it("shows selected/cap on each segment and a checkmark only when complete", () => {
    render(
      <SpellPickerTabs
        groups={[
          group({ key: "species", label: "Species", selectedIds: ["fb"], cap: 1 }),
          group({ key: "cantrips", label: "Cantrips", selectedIds: [], cap: 3 }),
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: /Species 1\/1 ✓/ })).toBeInTheDocument();
    const cantrips = screen.getByRole("radio", { name: /Cantrips 0\/3/ });
    expect(cantrips).toBeInTheDocument();
    expect(cantrips.textContent).not.toContain("✓");
  });

  it("renders the picker directly with no segmented control for a single group", () => {
    render(<SpellPickerTabs groups={[group({ key: "species", label: "Species", options: [fireBolt] })]} />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Fire Bolt" })).toBeInTheDocument();
  });
});
