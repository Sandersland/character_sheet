import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ManeuverRow from "@/features/class/ManeuverRow";
import type { ManeuverEntry } from "@/types/character";

function entry(overrides: Partial<ManeuverEntry> = {}): ManeuverEntry {
  return {
    id: "m1",
    name: "Trip Attack",
    description: "Knock a target prone.",
    ...overrides,
  };
}

describe("ManeuverRow — served die chip (#1381)", () => {
  it("renders the served superiority die as a chip on a known maneuver", () => {
    render(
      <ul>
        <ManeuverRow
          entry={entry({ effect: { effectType: "utility", dice: { count: 1, faces: 10, modifier: 0 }, scaling: { mode: "none" } } })}
          busy={false}
          onForget={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText("d10")).toBeInTheDocument();
  });

  it("renders no die chip when the maneuver serves no dice", () => {
    render(
      <ul>
        <ManeuverRow entry={entry()} busy={false} onForget={vi.fn()} />
      </ul>,
    );
    expect(screen.queryByText(/^d\d+$/)).not.toBeInTheDocument();
  });
});
