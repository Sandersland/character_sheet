import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ResourcePoolRow from "@/features/class/ResourcePoolRow";
import type { ResourcePool } from "@/types/character";

function pool(overrides: Partial<ResourcePool> = {}): ResourcePool {
  return {
    key: "wildShape",
    label: "Wild Shape",
    total: 2,
    recharge: "short-or-long",
    used: 0,
    remaining: 2,
    ...overrides,
  };
}

// #1685: labeled display parts (the armorClassBreakdown pattern) rendered
// verbatim next to the pool's description — never parsed by the client.
describe("ResourcePoolRow — details (#1685)", () => {
  it("renders each detail's label and value, in order", () => {
    const { container } = render(
      <ResourcePoolRow
        characterId="c1"
        pool={pool({ details: [{ label: "Max CR", value: "1/2 (no flying speed)" }, { label: "Duration", value: "2 hour(s)" }] })}
        busy={false}
        onOperations={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("Max CR 1/2 (no flying speed)");
    expect(container.textContent).toContain("Duration 2 hour(s)");
    const maxCrIndex = container.textContent!.indexOf("Max CR");
    const durationIndex = container.textContent!.indexOf("Duration");
    expect(maxCrIndex).toBeGreaterThanOrEqual(0);
    expect(durationIndex).toBeGreaterThan(maxCrIndex);
  });

  it("renders nothing detail-related when `details` is absent", () => {
    render(<ResourcePoolRow characterId="c1" pool={pool()} busy={false} onOperations={vi.fn()} />);
    expect(screen.queryByText(/Max CR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Duration/)).not.toBeInTheDocument();
  });
});
