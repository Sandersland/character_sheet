import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import MeterBar from "@/components/ui/MeterBar";

/** Returns the inner fill element (the coloured bar). */
function getFill(container: HTMLElement) {
  return container.querySelector(".h-full") as HTMLElement;
}

describe("MeterBar", () => {
  it("has role=meter with correct aria attributes", () => {
    render(<MeterBar current={7} max={10} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "7");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "10");
  });

  it("uses label prop for aria-label when provided", () => {
    render(<MeterBar current={5} max={10} label="HP" />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "HP");
  });

  it("falls back to '{current} of {max}' for aria-label", () => {
    render(<MeterBar current={3} max={8} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "3 of 8");
  });

  it("computes fill proportionally", () => {
    const { container } = render(<MeterBar current={5} max={10} />);
    expect(getFill(container).style.width).toBe("50%");
  });

  it("clamps fill to 0% when max is 0", () => {
    const { container } = render(<MeterBar current={5} max={0} />);
    expect(getFill(container).style.width).toBe("0%");
  });

  it("clamps fill to 100% when current exceeds max", () => {
    const { container } = render(<MeterBar current={15} max={10} />);
    expect(getFill(container).style.width).toBe("100%");
  });

  it("clamps fill to 0% when current is negative", () => {
    const { container } = render(<MeterBar current={-3} max={10} />);
    expect(getFill(container).style.width).toBe("0%");
  });

  it("applies garnet fill class by default", () => {
    const { container } = render(<MeterBar current={5} max={10} />);
    expect(getFill(container)).toHaveClass("bg-garnet-600");
  });

  it("applies arcane fill class for arcane tone", () => {
    const { container } = render(<MeterBar current={5} max={10} tone="arcane" />);
    expect(getFill(container)).toHaveClass("bg-arcane-500");
  });

  it("applies gold fill class for gold tone", () => {
    const { container } = render(<MeterBar current={5} max={10} tone="gold" />);
    expect(getFill(container)).toHaveClass("bg-gold-500");
  });
});
