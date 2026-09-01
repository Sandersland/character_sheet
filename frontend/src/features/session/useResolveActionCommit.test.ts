import { describe, expect, it } from "vitest";

import { allInstancesMissed } from "@/features/session/useResolveActionCommit";
import type { ResolutionRolls } from "@/features/session/useResolution";

function rolls(overrides: Partial<ResolutionRolls> = {}): ResolutionRolls {
  return { actionId: "action-1", toHit: null, save: null, effect: null, ...overrides };
}

describe("allInstancesMissed (#1983)", () => {
  it("false when rolls carries no instances at all (the common single-instance case)", () => {
    expect(allInstancesMissed(rolls())).toBe(false);
  });

  it("false when rolls.instances is an empty array", () => {
    expect(allInstancesMissed(rolls({ instances: [] }))).toBe(false);
  });

  it("false when at least one instance hit or crit", () => {
    const instances = [
      { toHit: { faces: [2], kept: 2, nat20: false, bonus: 6, total: 8, verdict: "miss" as const } },
      { toHit: { faces: [15], kept: 15, nat20: false, bonus: 6, total: 21, verdict: "hit" as const } },
    ];
    expect(allInstancesMissed(rolls({ instances }))).toBe(false);
  });

  it("true when every instance's toHit verdict is miss", () => {
    const instances = [
      { toHit: { faces: [2], kept: 2, nat20: false, bonus: 6, total: 8, verdict: "miss" as const } },
      { toHit: { faces: [3], kept: 3, nat20: false, bonus: 6, total: 9, verdict: "miss" as const } },
    ];
    expect(allInstancesMissed(rolls({ instances }))).toBe(true);
  });

  it("false for an auto-hit instanced resolution (no toHit on any instance, e.g. Magic Missile)", () => {
    const instances = [
      { effect: { spec: "1d4+1", faces: [2], total: 3, type: "force", kind: "damage" as const, crit: false } },
      { effect: { spec: "1d4+1", faces: [4], total: 5, type: "force", kind: "damage" as const, crit: false } },
    ];
    expect(allInstancesMissed(rolls({ instances }))).toBe(false);
  });
});
