import { describe, expect, it } from "vitest";

import {
  exhaustionEffectText,
  exhaustionMaxHpPenalty,
  exhaustionRollEffects,
  exhaustionSpeedPenalty,
} from "@/lib/srd/condition-data.js";
import { effectiveMaxHitPoints } from "@/lib/combat/hitpoints.js";

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

// PHB'14 p. 291 cumulative tiers: 1 checks, 2 +speed halved, 3 +attacks/saves, 4 +HP max halved (#1321), 5 +speed 0, 6 death.
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

    // Even current speed: ceil and floor agree, pinning the direction from both sides.
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

// Authored in this module (not the frontend) so it can't drift from exhaustionRollEffects/exhaustionSpeedPenalty (#1322).
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

  it("level 4: adds HP maximum halved (PHB'14 p. 291, enforced by exhaustionMaxHpPenalty since #1321)", () => {
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

  it("the HP-tier clause is included, matching the enforced exhaustionMaxHpPenalty halving (PHB'14 p. 291)", () => {
    expect(exhaustionEffectText(4, "EDITION_2014")).toContain("HP maximum halved");
  });

  it("clamps out-of-range levels", () => {
    expect(exhaustionEffectText(-5, "EDITION_2014")).toBe("No exhaustion.");
    expect(exhaustionEffectText(99, "EDITION_2014")).toBe("Death.");
  });

  // Verifies the SET of categories, not order — summarizeRollModifiers' KIND_ORDER differs from the grant array's order, and importing that frontend presenter here would violate the backend/frontend boundary (#1272).
  it("the disadvantage clause names the same categories that exhaustionRollEffects applies at that level", () => {
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

// PHB'14 p. 291 level-4 tier: HP max halved. Returns the SUBTRAHEND, not the result (like exhaustionSpeedPenalty); SRD 5.2 has no such tier (#1321).
describe("exhaustionMaxHpPenalty — 2014 (PHB'14 p. 291)", () => {
  it("is 0 below level 4", () => {
    expect(exhaustionMaxHpPenalty(0, 30, "EDITION_2014")).toBe(0);
    expect(exhaustionMaxHpPenalty(1, 30, "EDITION_2014")).toBe(0);
    expect(exhaustionMaxHpPenalty(2, 30, "EDITION_2014")).toBe(0);
    expect(exhaustionMaxHpPenalty(3, 30, "EDITION_2014")).toBe(0);
  });

  it("levels 4-6: subtracts ceil(currentMax/2) — PHB'14 p. 7 Round Down means the RESULT (currentMax − penalty) floors", () => {
    expect(exhaustionMaxHpPenalty(4, 30, "EDITION_2014")).toBe(15);
    expect(exhaustionMaxHpPenalty(5, 30, "EDITION_2014")).toBe(15);
    expect(exhaustionMaxHpPenalty(6, 30, "EDITION_2014")).toBe(15);
    // Odd max: ceil(31/2)=16, so the RESULT 31-16=15 is the floored half.
    expect(exhaustionMaxHpPenalty(4, 31, "EDITION_2014")).toBe(16);
  });
});

describe("exhaustionMaxHpPenalty — 2024 (SRD 5.2)", () => {
  it("is always 0 — SRD 5.2 has no hit-point-maximum exhaustion tier", () => {
    for (let level = 0; level <= 6; level++) {
      expect(exhaustionMaxHpPenalty(level, 30, "EDITION_2024")).toBe(0);
    }
  });
});

// effectiveMaxHitPoints composes this penalty with the feat layer and the max-HP >= 1 floor — the single function every HP-max consumer calls (#1321).
describe("effectiveMaxHitPoints — composition (#1321)", () => {
  it("stored max 30, no feat bonus, 2014 exhaustion 4 → floor(30/2) = 15", () => {
    expect(effectiveMaxHitPoints(30, 0, 4, "EDITION_2014")).toBe(15);
  });

  it("stored max 31 (odd) → still floors to 15", () => {
    expect(effectiveMaxHitPoints(31, 0, 4, "EDITION_2014")).toBe(15);
  });

  it("stored max 1 halves to 0, but floors at 1 (this repo's max-HP ≥ 1 invariant, not RAW 5e text)", () => {
    expect(effectiveMaxHitPoints(1, 0, 4, "EDITION_2014")).toBe(1);
  });

  it("2014 exhaustion below 4: no penalty, feat bonus still applies", () => {
    expect(effectiveMaxHitPoints(30, 4, 3, "EDITION_2014")).toBe(34);
  });

  it("2024: never halves regardless of exhaustion level", () => {
    expect(effectiveMaxHitPoints(30, 0, 6, "EDITION_2024")).toBe(30);
  });
});
