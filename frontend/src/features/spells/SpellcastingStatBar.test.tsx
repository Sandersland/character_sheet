import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import SpellcastingStatBar from "@/features/spells/SpellcastingStatBar";

describe("SpellcastingStatBar", () => {
  it("renders Save DC and Spell Attack boxes", () => {
    render(<SpellcastingStatBar spellSaveDC={15} spellAttackBonus={7} prepared={null} />);
    expect(screen.getByText("Save DC")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Spell Attack")).toBeInTheDocument();
    expect(screen.getByText("+7")).toBeInTheDocument();
  });

  it("renders the Prepared box as count / limit when present", () => {
    render(
      <SpellcastingStatBar spellSaveDC={15} spellAttackBonus={7} prepared={{ count: 11, limit: 12 }} />,
    );
    expect(screen.getByText("Prepared")).toBeInTheDocument();
    expect(screen.getByText("11 / 12")).toBeInTheDocument();
  });

  it("hides the Prepared box when there is no prepare mechanic", () => {
    render(<SpellcastingStatBar spellSaveDC={13} spellAttackBonus={5} prepared={null} />);
    expect(screen.queryByText("Prepared")).not.toBeInTheDocument();
  });
});
