// assassinateEligible (#1526) — pure gate, no DB. Mirrors the
// stunning-strike.ts unit-test shape (canAttemptStunningStrike): exercise the
// rule function directly rather than only through a route/serialize
// integration test.

import { describe, expect, it } from "vitest";

import { ASSASSINATE_LEVEL, assassinateEligible } from "@/lib/classes/assassinate.js";

const ASSASSIN_ROGUE = { name: "rogue", level: ASSASSINATE_LEVEL, subclass: "Assassin" };
const THIEF_ROGUE = { name: "rogue", level: ASSASSINATE_LEVEL, subclass: "Thief" };

describe("assassinateEligible (#1526)", () => {
  it("a 2014 Assassin at L3 is eligible", () => {
    expect(assassinateEligible([ASSASSIN_ROGUE], "EDITION_2014")).toBe(true);
  });

  it("a 2014 Assassin below L3 is not eligible", () => {
    expect(assassinateEligible([{ ...ASSASSIN_ROGUE, level: 2 }], "EDITION_2014")).toBe(false);
  });

  it("a 2014 non-Assassin rogue (Thief) is not eligible", () => {
    expect(assassinateEligible([THIEF_ROGUE], "EDITION_2014")).toBe(false);
  });

  it("a character with no rogue class entry is not eligible", () => {
    expect(assassinateEligible([{ name: "fighter", level: 20, subclass: "Champion" }], "EDITION_2014")).toBe(false);
  });

  // Mutation-proof (#1526 AC): SRD 5.2 / PHB'24 deleted the auto-crit clause
  // (#1231) — dropping the `edition !== "EDITION_2014"` guard in
  // assassinateEligible would hand a 2024 Assassin a mechanic PHB'24 removed,
  // and is the ONLY thing this test stands between that and shipping.
  it("a 2024 Assassin at L3 is NOT eligible — 2024 deleted the auto-crit clause", () => {
    expect(assassinateEligible([ASSASSIN_ROGUE], "EDITION_2024")).toBe(false);
  });

  it("resolves the subclass via resolveSubclassSlug, not a name literal — a near-miss name does not match", () => {
    expect(assassinateEligible([{ ...ASSASSIN_ROGUE, subclass: "Warrior of the Assassin" }], "EDITION_2014")).toBe(
      false,
    );
  });
});
