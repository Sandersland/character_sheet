import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ConditionRollBanner from "@/features/conditions/ConditionRollBanner";
import type { RollModifier } from "@/types/character";

const poisoned: RollModifier[] = [
  { mode: "disadvantage", kind: "attack", source: "Poisoned" },
  { mode: "disadvantage", kind: "check", source: "Poisoned" },
];
const rage: RollModifier[] = [
  { mode: "advantage", kind: "check", ability: "strength", source: "Rage" },
  { mode: "advantage", kind: "save", ability: "strength", source: "Rage" },
];

describe("ConditionRollBanner (#984)", () => {
  it("renders one banner naming the condition and its roll effect", () => {
    render(<ConditionRollBanner modifiers={poisoned} />);
    // The two Poisoned grants collapse into ONE banner, stated once.
    expect(screen.getAllByText("Poisoned")).toHaveLength(1);
    expect(
      screen.getByText("Disadvantage on attack rolls and ability checks"),
    ).toBeInTheDocument();
  });

  it("renders nothing when there are no active roll modifiers", () => {
    const { container } = render(<ConditionRollBanner modifiers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one banner per distinct source when several are active", () => {
    render(<ConditionRollBanner modifiers={[...rage, ...poisoned]} />);
    expect(screen.getByText("Rage")).toBeInTheDocument();
    expect(screen.getByText("Poisoned")).toBeInTheDocument();
  });

  it("phrases an advantage source with its ability-scoped effect", () => {
    render(<ConditionRollBanner modifiers={rage} />);
    expect(
      screen.getByText("Advantage on Strength checks and Strength saving throws"),
    ).toBeInTheDocument();
  });

  it("renders a single banner joining both clauses for a mixed-tone source", () => {
    // One source granting both advantage and disadvantage collapses to ONE
    // banner (name appears once) with both clauses joined by "; ".
    const mixed: RollModifier[] = [
      { mode: "advantage", kind: "check", source: "Enlarge/Reduce" },
      { mode: "disadvantage", kind: "save", source: "Enlarge/Reduce" },
    ];
    render(<ConditionRollBanner modifiers={mixed} />);
    expect(screen.getAllByText("Enlarge/Reduce")).toHaveLength(1);
    expect(
      screen.getByText("Advantage on ability checks; Disadvantage on saving throws"),
    ).toBeInTheDocument();
  });
});
