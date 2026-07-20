import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import CeremonyStepRail from "@/features/ceremony/CeremonyStepRail";
import { axe } from "@/test/axe";
import type { RailStep } from "@/lib/ceremonySteps";

const STEPS: RailStep[] = [
  { key: "hitPoints", label: "Hit Points" },
  { key: "advancement", label: "Ability Score / Feat" },
  { key: "review", label: "Review" },
];

describe("CeremonyStepRail", () => {
  it("renders every step's label in order", () => {
    render(<CeremonyStepRail steps={STEPS} currentKey="advancement" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("aria-label"))).toEqual([
      "Step 1: Hit Points",
      "Step 2: Ability Score / Feat",
      "Step 3: Review",
    ]);
  });

  it("marks the active step with aria-current=step", () => {
    render(<CeremonyStepRail steps={STEPS} currentKey="advancement" />);
    const active = screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute("aria-label", "Step 2: Ability Score / Feat");
  });

  it("shows a check glyph on done steps and the number elsewhere", () => {
    const { container } = render(<CeremonyStepRail steps={STEPS} currentKey="review" />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("never wraps: the ol is not flex-wrap and connectors flex to fill (#1182)", () => {
    const { container } = render(<CeremonyStepRail steps={STEPS} currentKey="advancement" />);
    const ol = container.querySelector("ol");
    expect(ol?.className).not.toContain("flex-wrap");
    // Connectors carry flex-1 so they shrink instead of pushing a dot to a 2nd line.
    expect(container.querySelectorAll("span.flex-1")).toHaveLength(STEPS.length - 1);
  });

  it("has no axe violations", async () => {
    const { container } = render(<CeremonyStepRail steps={STEPS} currentKey="hitPoints" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
