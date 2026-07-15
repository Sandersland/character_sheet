import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import SpellSlotSummary from "@/features/spells/SpellSlotSummary";
import type { SpellSlots } from "@/types/character";

describe("SpellSlotSummary", () => {
  it("renders nothing when there are no slots", () => {
    const { container } = render(<SpellSlotSummary slots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a row and readout per slot level", () => {
    const slots: SpellSlots[] = [
      { level: 1, total: 4, used: 1 },
      { level: 2, total: 3, used: 3 },
    ];
    render(<SpellSlotSummary slots={slots} />);
    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("Level 2")).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("draws total pips with available filled and expended hollow", () => {
    const { container } = render(
      <SpellSlotSummary slots={[{ level: 1, total: 4, used: 1 }]} />
    );
    const pips = container.querySelectorAll("li span[aria-hidden] > span");
    expect(pips).toHaveLength(4);
    const filled = [...pips].filter((p) => p.className.includes("bg-arcane-500"));
    expect(filled).toHaveLength(3);
  });

  it("renders no expend or restore controls (read-only)", () => {
    render(<SpellSlotSummary slots={[{ level: 1, total: 2, used: 0 }]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
