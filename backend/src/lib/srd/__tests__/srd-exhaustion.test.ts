import { describe, expect, it } from "vitest";

import { exhaustionSpeedPenalty } from "@/lib/srd/condition-data.js";

// SRD 5.2: each exhaustion level reduces Speed by 5 ft (−5 ft×level).
describe("exhaustionSpeedPenalty (#1136)", () => {
  it("is 0 at level 0", () => {
    expect(exhaustionSpeedPenalty(0)).toBe(0);
  });

  it("is −5 ft per level", () => {
    expect(exhaustionSpeedPenalty(1)).toBe(5);
    expect(exhaustionSpeedPenalty(3)).toBe(15);
    expect(exhaustionSpeedPenalty(6)).toBe(30);
  });

  it("never goes negative for a stray sub-zero level", () => {
    expect(exhaustionSpeedPenalty(-2)).toBe(0);
  });
});
