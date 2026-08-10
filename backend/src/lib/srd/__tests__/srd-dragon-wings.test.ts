import { describe, it, expect } from "vitest";

import { deriveDragonWingsFlySpeed } from "@/lib/srd/srd.js";

const fly = (draconicLevel: number, isUnarmored: boolean, walkingSpeed = 30, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014") =>
  deriveDragonWingsFlySpeed({ draconicLevel, isUnarmored, walkingSpeed }, edition);

// PHB'14 p.107: passive, indefinite-duration flying speed equal to current
// speed — this derived value is exact for 2014. PHB'24 p.148 (SRD 5.2
// primary) is a genuinely different mechanic (flat 60ft, 1hr, resource-gated
// `dragonWings` pool, already seeded) that #1123 explicitly scopes OUT
// (while-active/toggled resources aren't derived here) — so 2024 gets no
// value from this path at all, never a walking-speed guess.
describe("deriveDragonWingsFlySpeed (#1123) — FORKS: 2014 passive derive, 2024 withheld (resource-gated, out of scope)", () => {
  describe("2014", () => {
    it("below L14 is absent even while unarmored", () => {
      expect(fly(13, true)).toBeUndefined();
    });

    it("L14 unarmored equals walking speed", () => {
      expect(fly(14, true)).toBe(30);
    });

    it("L14 while armored is absent (RAW: wings don't fit under armor)", () => {
      expect(fly(14, false)).toBeUndefined();
    });

    it("tracks a non-default walking speed (e.g. a race with 25ft base)", () => {
      expect(fly(14, true, 25)).toBe(25);
    });

    it("higher than L14 stays gated on unarmored, not level alone", () => {
      expect(fly(20, false)).toBeUndefined();
      expect(fly(20, true)).toBe(30);
    });
  });

  describe("2024 — withheld entirely (flat 60ft is a resource-gated active buff, not a passive derive)", () => {
    it("L14 unarmored gets NO derived flySpeed (the mutation-proof case: this must not silently regress to walking speed)", () => {
      expect(fly(14, true, 30, "EDITION_2024")).toBeUndefined();
    });

    it("even far above L14 unarmored, still undefined", () => {
      expect(fly(20, true, 30, "EDITION_2024")).toBeUndefined();
    });
  });
});
