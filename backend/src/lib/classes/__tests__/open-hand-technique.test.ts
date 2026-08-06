import { describe, expect, it } from "vitest";

import {
  canImposeOpenHandRider,
  openHandRiderSummary,
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

// #1501: Addle's duration wording is the only clause that forks between the
// two Open Hand subclasses — verified against each edition's own SRD text
// directly (see open-hand-technique.ts's addleClause comment for the exact
// citations), reconciling the pre-#1501 disagreement between the seeded row
// and this module's own summary text rather than assuming either was right.
describe("openHandRiderSummary — Addle forks by edition (#1501), Push/Topple do not", () => {
  it("2024: Addle ends at the START of the target's ('its') next turn, scoped to Opportunity Attacks", () => {
    expect(openHandRiderSummary("addle", 14, undefined, "applied", "EDITION_2024")).toBe(
      "Open Hand Technique — Addle (no save): the target can't make Opportunity Attacks until the start of its next turn.",
    );
  });

  it("2014: Addle ends at the END of the monk's ('your') next turn, and covers all reactions", () => {
    expect(openHandRiderSummary("addle", 14, undefined, "applied", "EDITION_2014")).toBe(
      "Open Hand Technique — Addle (no save): the target can't take reactions until the end of your next turn.",
    );
  });

  it("Push/Topple summary text is identical across editions", () => {
    const push2024 = openHandRiderSummary("push", 14, 10, "applied", "EDITION_2024");
    const push2014 = openHandRiderSummary("push", 14, 10, "applied", "EDITION_2014");
    expect(push2024).toBe(push2014);
    expect(push2024).toBe("Open Hand Technique — Push (Strength save), DC 14, target rolled 10: failed the save — pushed up to 15 ft away.");
  });
});
