// effectiveMaxHitPoints composes: feat bonus is added before exhaustion's tier-4 halving (PHB'14 p. 291) is subtracted, floored at 1.
import { describe, expect, it } from "vitest";

import { effectiveMaxHitPoints } from "@/lib/combat/hitpoints.js";

describe("effectiveMaxHitPoints — feat bonus applies BEFORE the exhaustion halving (decision 2)", () => {
  it("stored max 28 + Tough 2×(hitDice.total 2) = 32 → effective 16, not 15", () => {
    expect(effectiveMaxHitPoints(28, 4, 4, "EDITION_2014")).toBe(16);
  });

  it("no exhaustion: feat bonus passes through untouched", () => {
    expect(effectiveMaxHitPoints(28, 4, 0, "EDITION_2014")).toBe(32);
  });

  it("2024: feat bonus applies but exhaustion never subtracts (no 2024 HP tier)", () => {
    expect(effectiveMaxHitPoints(28, 4, 6, "EDITION_2024")).toBe(32);
  });

  it("floors at 1 even when the feat bonus can't rescue a max of 1", () => {
    expect(effectiveMaxHitPoints(1, 0, 4, "EDITION_2014")).toBe(1);
  });

  it("a negative feat bonus (should not occur in practice) still composes through the same floor", () => {
    expect(effectiveMaxHitPoints(4, -3, 0, "EDITION_2014")).toBe(1);
  });
});
