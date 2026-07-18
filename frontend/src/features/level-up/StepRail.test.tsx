import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import StepRail from "@/features/level-up/StepRail";
import { axe } from "@/test/axe";
import type { LevelUpStep } from "@/types/character";

const PLAN: LevelUpStep[] = [
  { kind: "hitPoints" },
  { kind: "advancement", count: 1 },
  { kind: "review" },
];

describe("StepRail", () => {
  it("renders every step's display label in plan order", () => {
    render(<StepRail steps={PLAN} currentKey="advancement" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("aria-label"))).toEqual([
      "Step 1: Hit Points",
      "Step 2: Ability Score",
      "Step 3: Review",
    ]);
  });

  it("marks the active step with aria-current=step", () => {
    render(<StepRail steps={PLAN} currentKey="advancement" />);
    const active = screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute("aria-label", "Step 2: Ability Score");
  });

  it("shows a check glyph on done steps and the number elsewhere", () => {
    const { container } = render(<StepRail steps={PLAN} currentKey="review" />);
    // Steps 1–2 are done → checks; step 3 is active → its number.
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<StepRail steps={PLAN} currentKey="hitPoints" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
