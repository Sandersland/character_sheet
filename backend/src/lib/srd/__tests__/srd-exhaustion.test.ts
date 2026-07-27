import { describe, expect, it } from "vitest";

import { exhaustionEffectText, exhaustionRollEffects, exhaustionSpeedPenalty } from "@/lib/srd/condition-data.js";

// SRD 5.2: each exhaustion level reduces Speed by 5 ft (−5 ft×level).
describe("exhaustionSpeedPenalty — 2024 (SRD 5.2, #1136)", () => {
  it("is 0 at level 0", () => {
    expect(exhaustionSpeedPenalty(0, 30, "EDITION_2024")).toBe(0);
  });

  it("is −5 ft per level", () => {
    expect(exhaustionSpeedPenalty(1, 30, "EDITION_2024")).toBe(5);
    expect(exhaustionSpeedPenalty(3, 30, "EDITION_2024")).toBe(15);
    expect(exhaustionSpeedPenalty(6, 30, "EDITION_2024")).toBe(30);
  });

  it("never goes negative for a stray sub-zero level", () => {
    expect(exhaustionSpeedPenalty(-2, 30, "EDITION_2024")).toBe(0);
  });
});

// PHB'14 p. 291 (Appendix A), cumulative tiers: 1 disadvantage on ability
// checks, 2 +speed halved, 3 +disadvantage on attacks/saves, 4 +HP max halved
// (out of scope, #1307), 5 +speed 0, 6 death.
describe("exhaustionSpeedPenalty — 2014 (PHB'14 p. 291)", () => {
  it("level 0 or 1: no Speed penalty yet", () => {
    expect(exhaustionSpeedPenalty(0, 30, "EDITION_2014")).toBe(0);
    expect(exhaustionSpeedPenalty(1, 30, "EDITION_2014")).toBe(0);
  });

  it("levels 2-4: subtracts ceil(currentSpeed/2), so the RESULT (currentSpeed − penalty) is floor(currentSpeed/2) — half, rounded down, matching Prone's round-down convention", () => {
    expect(exhaustionSpeedPenalty(2, 25, "EDITION_2014")).toBe(13);
    expect(exhaustionSpeedPenalty(3, 25, "EDITION_2014")).toBe(13);
    expect(exhaustionSpeedPenalty(4, 25, "EDITION_2014")).toBe(13);
    expect(25 - exhaustionSpeedPenalty(2, 25, "EDITION_2014")).toBe(12);

    // Even current speed (30): ceil and floor agree, pinning the direction
    // from both sides — the result is still exactly half.
    expect(exhaustionSpeedPenalty(2, 30, "EDITION_2014")).toBe(15);
    expect(30 - exhaustionSpeedPenalty(2, 30, "EDITION_2014")).toBe(15);
  });

  it("level 5+: Speed reduced to exactly 0 — a floor on currentSpeed, not currentSpeed - 5", () => {
    expect(exhaustionSpeedPenalty(5, 40, "EDITION_2014")).toBe(40);
    expect(exhaustionSpeedPenalty(6, 40, "EDITION_2014")).toBe(40);
  });

  it("never goes negative for a stray sub-zero level", () => {
    expect(exhaustionSpeedPenalty(-2, 30, "EDITION_2014")).toBe(0);
  });

  it("a currentSpeed of 0 stays a no-op penalty (nothing left to floor)", () => {
    expect(exhaustionSpeedPenalty(5, 0, "EDITION_2014")).toBe(0);
  });
});

describe("exhaustionRollEffects — 2024 (SRD 5.2, #1136)", () => {
  it("level 0 grants no roll effects", () => {
    expect(exhaustionRollEffects(0, "EDITION_2024")).toEqual([]);
  });

  it("is a flat −2×level on every d20 Test (attack/check/save/initiative)", () => {
    expect(exhaustionRollEffects(1, "EDITION_2024")).toEqual([
      { mode: "flat", modifier: -2, kind: "attack" },
      { mode: "flat", modifier: -2, kind: "check" },
      { mode: "flat", modifier: -2, kind: "save" },
      { mode: "flat", modifier: -2, kind: "initiative" },
    ]);
    expect(exhaustionRollEffects(3, "EDITION_2024")).toEqual([
      { mode: "flat", modifier: -6, kind: "attack" },
      { mode: "flat", modifier: -6, kind: "check" },
      { mode: "flat", modifier: -6, kind: "save" },
      { mode: "flat", modifier: -6, kind: "initiative" },
    ]);
  });
});

describe("exhaustionRollEffects — 2014 (PHB'14 p. 291)", () => {
  it("level 0: no roll effects", () => {
    expect(exhaustionRollEffects(0, "EDITION_2014")).toEqual([]);
  });

  it("level 1: disadvantage on ability checks — including Initiative, a Dex check (PHB'14 p. 189)", () => {
    expect(exhaustionRollEffects(1, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
    ]);
  });

  it("level 2: still only the tier-1 grant (Speed-halved has no roll effect)", () => {
    expect(exhaustionRollEffects(2, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
    ]);
  });

  it("level 3: cumulative — adds disadvantage on attack rolls and saving throws", () => {
    expect(exhaustionRollEffects(3, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "save" },
    ]);
  });

  it("level 6 (death): the tier-3 grant persists — no new roll effect is added by death itself", () => {
    expect(exhaustionRollEffects(6, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "save" },
    ]);
  });

  it("a stray sub-zero level grants nothing", () => {
    expect(exhaustionRollEffects(-2, "EDITION_2014")).toEqual([]);
  });
});

// #1322: the display sentence next to the numbers above. Authored in this
// module (not the frontend) so it can never drift from what
// exhaustionRollEffects/exhaustionSpeedPenalty actually apply.
describe("exhaustionEffectText — 2014 (PHB'14 p. 291, Appendix A)", () => {
  it("level 0: no exhaustion", () => {
    expect(exhaustionEffectText(0, "EDITION_2014")).toBe("No exhaustion.");
  });

  it("level 1: disadvantage on ability checks and initiative only — Speed-halved doesn't start until level 2", () => {
    expect(exhaustionEffectText(1, "EDITION_2014")).toBe(
      "Disadvantage on ability checks and initiative.",
    );
  });

  it("level 2: adds Speed halved", () => {
    expect(exhaustionEffectText(2, "EDITION_2014")).toBe(
      "Disadvantage on ability checks and initiative; Speed halved.",
    );
  });

  it("2014 level 3 text names every clause the rollModifiers and Speed actually apply (PHB'14 p. 291)", () => {
    expect(exhaustionEffectText(3, "EDITION_2014")).toBe(
      "Disadvantage on attack rolls, ability checks, saving throws, and initiative; Speed halved.",
    );
  });

  it("level 4: adds HP maximum halved (stated per PHB'14 p. 291 even though the app doesn't enforce it yet — #1400)", () => {
    expect(exhaustionEffectText(4, "EDITION_2014")).toBe(
      "Disadvantage on attack rolls, ability checks, saving throws, and initiative; Speed halved; HP maximum halved.",
    );
  });

  it("level 5: Speed 0 replaces Speed halved; HP maximum halved persists", () => {
    expect(exhaustionEffectText(5, "EDITION_2014")).toBe(
      "Disadvantage on attack rolls, ability checks, saving throws, and initiative; Speed 0; HP maximum halved.",
    );
  });

  it("level 6: death — no clause list", () => {
    expect(exhaustionEffectText(6, "EDITION_2014")).toBe("Death.");
  });

  it("the HP-tier clause is included, honestly reporting an unimplemented rule rather than under-reporting PHB'14 p. 291 (#1400)", () => {
    expect(exhaustionEffectText(4, "EDITION_2014")).toContain("HP maximum halved");
  });

  it("clamps out-of-range levels", () => {
    expect(exhaustionEffectText(-5, "EDITION_2014")).toBe("No exhaustion.");
    expect(exhaustionEffectText(99, "EDITION_2014")).toBe("Death.");
  });

  // Names what this actually verifies: the categories and their order, not a
  // character-by-character diff against the rendered banner. summarizeRollModifiers
  // is a frontend presenter, and a backend test importing it would be a
  // boundary-violation (#1272) — so the shared vocabulary is pinned on both
  // sides separately, and this is the backend half.
  it("the disadvantage clause names the same categories, in the same order, that exhaustionRollEffects applies at that level", () => {
    expect(exhaustionEffectText(3, "EDITION_2014")).toContain(
      "Disadvantage on attack rolls, ability checks, saving throws, and initiative",
    );
    expect(exhaustionRollEffects(3, "EDITION_2014").map((e) => e.kind)).toEqual([
      "check",
      "initiative",
      "attack",
      "save",
    ]);
  });
});

describe("exhaustionEffectText — 2024 (SRD 5.2)", () => {
  it("level 0: no exhaustion", () => {
    expect(exhaustionEffectText(0, "EDITION_2024")).toBe("No exhaustion.");
  });

  it("level 1: −2 on d20 Tests; Speed −5 ft (Unicode minus U+2212, not hyphen-minus)", () => {
    expect(exhaustionEffectText(1, "EDITION_2024")).toBe("−2 on d20 Tests; Speed −5 ft.");
  });

  it("level 3: −6 on d20 Tests; Speed −15 ft", () => {
    expect(exhaustionEffectText(3, "EDITION_2024")).toBe("−6 on d20 Tests; Speed −15 ft.");
  });

  it("level 6: death", () => {
    expect(exhaustionEffectText(6, "EDITION_2024")).toBe("Death.");
  });

  it("clamps out-of-range levels", () => {
    expect(exhaustionEffectText(-5, "EDITION_2024")).toBe("No exhaustion.");
    expect(exhaustionEffectText(99, "EDITION_2024")).toBe("Death.");
  });
});
