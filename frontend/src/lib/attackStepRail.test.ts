import { describe, it, expect } from "vitest";

import { stepRail } from "@/lib/attackStepRail";

describe("stepRail (#811)", () => {
  it("pre-roll: step 1 active, the rest pending", () => {
    expect(stepRail({ hasRoll: false, verdict: undefined, hasDamage: false })).toEqual({
      rollToHit: "active",
      callIt: "pending",
      damage: "pending",
    });
  });

  it("rolled, unresolved: call-it active AND damage active (implicit hit — no gate)", () => {
    expect(stepRail({ hasRoll: true, verdict: undefined, hasDamage: false })).toEqual({
      rollToHit: "done",
      callIt: "active",
      damage: "active",
    });
  });

  it("verdict set, no damage: call-it done, damage active", () => {
    expect(stepRail({ hasRoll: true, verdict: "hit", hasDamage: false })).toEqual({
      rollToHit: "done",
      callIt: "done",
      damage: "active",
    });
  });

  it("miss parks the damage step — a missed attack deals none", () => {
    expect(stepRail({ hasRoll: true, verdict: "miss", hasDamage: false })).toEqual({
      rollToHit: "done",
      callIt: "done",
      damage: "pending",
    });
  });

  it("damage rolled: everything done", () => {
    expect(stepRail({ hasRoll: true, verdict: "crit", hasDamage: true })).toEqual({
      rollToHit: "done",
      callIt: "done",
      damage: "done",
    });
  });
});
