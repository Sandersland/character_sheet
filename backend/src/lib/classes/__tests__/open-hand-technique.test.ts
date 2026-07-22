import { describe, expect, it } from "vitest";

import {
  canImposeOpenHandRider,
  resolveOpenHandRiderOutcome,
} from "@/lib/classes/open-hand-technique.js";

describe("canImposeOpenHandRider (once-per-turn guard)", () => {
  it("allows a first rider this turn", () => {
    expect(canImposeOpenHandRider({ usedThisTurn: false })).toBe(true);
  });

  it("blocks a second rider in the same turn", () => {
    expect(canImposeOpenHandRider({ usedThisTurn: true })).toBe(false);
  });
});

describe("resolveOpenHandRiderOutcome (SRD 5.2 Open Hand Technique)", () => {
  it("addle always applies — it has no save", () => {
    expect(resolveOpenHandRiderOutcome("addle", 1, 20)).toBe("applied");
    expect(resolveOpenHandRiderOutcome("addle", 20, 5)).toBe("applied");
  });

  it("push applies (pushed) when the Strength save fails (roll < DC)", () => {
    expect(resolveOpenHandRiderOutcome("push", 10, 14)).toBe("applied");
  });

  it("push resists (no effect) when the save meets or beats the DC", () => {
    expect(resolveOpenHandRiderOutcome("push", 14, 14)).toBe("resisted");
    expect(resolveOpenHandRiderOutcome("push", 20, 14)).toBe("resisted");
  });

  it("topple applies (prone) when the Dexterity save fails (roll < DC)", () => {
    expect(resolveOpenHandRiderOutcome("topple", 10, 14)).toBe("applied");
  });

  it("topple resists (no effect) when the save meets or beats the DC", () => {
    expect(resolveOpenHandRiderOutcome("topple", 14, 14)).toBe("resisted");
  });
});
