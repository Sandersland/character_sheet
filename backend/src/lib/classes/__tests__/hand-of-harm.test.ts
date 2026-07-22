import { describe, expect, it } from "vitest";

import { canDealHandOfHarm } from "@/lib/classes/hand-of-harm.js";

describe("canDealHandOfHarm (once-per-turn guard)", () => {
  it("allows a first hit this turn", () => {
    expect(canDealHandOfHarm({ usedThisTurn: false })).toBe(true);
  });

  it("blocks a second hit in the same turn", () => {
    expect(canDealHandOfHarm({ usedThisTurn: true })).toBe(false);
  });
});
