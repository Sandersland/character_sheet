import { describe, it, expect } from "vitest";
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
        />
      </ul>,
    );
    expect(screen.getByText("d10")).toBeInTheDocument();
  });

  it("renders no die chip when the maneuver serves no dice", () => {
    render(
      <ul>
        <ManeuverRow entry={entry()} />
      </ul>,
    );
    expect(screen.queryByText(/^d\d+$/)).not.toBeInTheDocument();
  });
});

// #1516: a maneuver replacement is bound to learn-time (PHB'14 Battle Master
// p.73 / SRD 5.2 equivalent) and only offered inside the level-up ceremony's
// own "maneuvers" step — the sheet's row renders no forget affordance at all.
describe("ManeuverRow — no forget affordance (#1516)", () => {
  it("renders no Forget button", () => {
    render(
      <ul>
        <ManeuverRow entry={entry()} />
      </ul>,
    );
    expect(screen.queryByRole("button", { name: /forget/i })).not.toBeInTheDocument();
  });
});
