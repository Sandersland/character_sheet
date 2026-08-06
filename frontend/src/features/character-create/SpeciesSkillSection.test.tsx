// #1689: SpeciesSkillSection (Half-Elf's Skill Versatility) — mirrors
// SkillSection's own checkbox-grid shape and render-or-not contract.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SpeciesSkillSection from "@/features/character-create/SpeciesSkillSection";
import type { CreationSpeciesSkillChoice } from "@/lib/characterCreation";

function renderSection(choice: Partial<CreationSpeciesSkillChoice> = {}, onToggle = vi.fn()) {
  const fullChoice: CreationSpeciesSkillChoice = {
    applicable: true,
    count: 2,
    options: [
      { key: "stealth", label: "Stealth" },
      { key: "perception", label: "Perception" },
      { key: "athletics", label: "Athletics" },
    ],
    selected: [],
    complete: false,
    ...choice,
  };
  render(<SpeciesSkillSection choice={fullChoice} onToggle={onToggle} />);
  return { onToggle };
}

describe("SpeciesSkillSection (#1689)", () => {
  it("renders nothing when the served spec is inert (applicable:false)", () => {
    const { container } = render(
      <SpeciesSkillSection choice={{ applicable: false, count: 0, options: [], selected: [], complete: true }} onToggle={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count and the current selection tally", () => {
    renderSection({ selected: ["stealth"] });
    expect(screen.getByText("Choose 2 (1/2 selected)")).toBeInTheDocument();
  });

  it("lists every served option by its resolved label, never the raw key", () => {
    renderSection();
    expect(screen.getByText("Stealth")).toBeInTheDocument();
    expect(screen.getByText("Perception")).toBeInTheDocument();
  });

  it("toggles onToggle with the skill key when a checkbox is clicked", async () => {
    const { onToggle } = renderSection();
    await userEvent.click(screen.getByRole("checkbox", { name: "Stealth" }));
    expect(onToggle).toHaveBeenCalledWith("stealth");
  });

  it("disables unselected options once the count is reached, but not the selected ones", () => {
    renderSection({ selected: ["stealth", "perception"] });
    expect(screen.getByRole("checkbox", { name: "Stealth" })).not.toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Perception" })).not.toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Athletics" })).toBeDisabled();
  });

  it("marks selected skills as checked", () => {
    renderSection({ selected: ["perception"] });
    expect(screen.getByRole("checkbox", { name: "Perception" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Stealth" })).not.toBeChecked();
  });
});
